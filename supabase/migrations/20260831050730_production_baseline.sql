


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."can_read_trip"("target_trip" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.owns_trip(target_trip) or exists (
    select 1 from public.trip_members
    where trip_id = target_trip and user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."can_read_trip"("target_trip" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_write_trip"("target_trip" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.owns_trip(target_trip) or exists (
    select 1 from public.trip_members
    where trip_id = target_trip and user_id = auth.uid() and access = 'write'
  );
$$;


ALTER FUNCTION "public"."can_write_trip"("target_trip" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_trip"("trip" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.trips where id = trip and user_id = auth.uid());
$$;


ALTER FUNCTION "public"."owns_trip"("trip" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_idea_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.user_id := (select user_id from public.trips where id = new.trip_id);
  return new;
end;
$$;


ALTER FUNCTION "public"."set_idea_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."share_trip"("target_trip" "uuid", "target_email" "text", "target_access" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_user uuid;
  normalized_email text := lower(trim(target_email));
begin
  if not public.owns_trip(target_trip) then
    raise exception 'Seul le propriétaire peut partager ce voyage.';
  end if;

  if normalized_email is null or normalized_email = '' then
    raise exception 'Adresse email invalide.';
  end if;

  if target_access is null or target_access not in ('read', 'write') then
    raise exception 'Le niveau d''accès doit être read ou write.';
  end if;

  select id into target_user
  from auth.users
  where lower(email) = normalized_email;

  if target_user is null then
    raise exception 'Aucun compte ne correspond à cette adresse. Votre ami doit d''abord s''inscrire.';
  end if;

  if target_user = auth.uid() then
    raise exception 'Vous êtes déjà propriétaire de ce voyage.';
  end if;

  insert into public.trip_members (trip_id, user_id, email, access)
  values (target_trip, target_user, normalized_email, target_access)
  on conflict (trip_id, user_id) do update
    set email = excluded.email, access = excluded.access;
end;
$$;


ALTER FUNCTION "public"."share_trip"("target_trip" "uuid", "target_email" "text", "target_access" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ideas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "city" "text" NOT NULL,
    "title" "text" NOT NULL,
    "kr" "text",
    "type" "text",
    "verdict" "text" DEFAULT 'voir'::"text" NOT NULL,
    "note" "text",
    "description" "text",
    "zone" "text",
    "avis" "text",
    "when_note" "text",
    "lat" double precision,
    "lng" double precision,
    "origin" "text" DEFAULT 'perso'::"text" NOT NULL,
    "favori" boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "place_id" "text",
    CONSTRAINT "ideas_verdict_check1" CHECK (("verdict" = ANY (ARRAY['oui'::"text", 'option'::"text", 'voir'::"text", 'non'::"text"])))
);


ALTER TABLE "public"."ideas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ideas_legacy" (
    "id" "text" NOT NULL,
    "city" "text" NOT NULL,
    "title" "text" NOT NULL,
    "kr" "text",
    "type" "text",
    "verdict" "text" DEFAULT 'voir'::"text" NOT NULL,
    "note" "text",
    "description" "text",
    "zone" "text",
    "avis" "text",
    "when_note" "text",
    "lat" double precision,
    "lng" double precision,
    "origin" "text" DEFAULT 'carnet'::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "favori" boolean DEFAULT false NOT NULL,
    CONSTRAINT "ideas_verdict_check" CHECK (("verdict" = ANY (ARRAY['oui'::"text", 'option'::"text", 'voir'::"text", 'non'::"text"])))
);


ALTER TABLE "public"."ideas_legacy" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_members" (
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "access" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trip_members_access_check" CHECK (("access" = ANY (ARRAY['read'::"text", 'write'::"text"])))
);


ALTER TABLE "public"."trip_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text" NOT NULL,
    "native_name" "text",
    "start_date" "date",
    "end_date" "date",
    "cities" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "answers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ideas_legacy"
    ADD CONSTRAINT "ideas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_pkey" PRIMARY KEY ("trip_id", "user_id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



CREATE INDEX "ideas_city_idx" ON "public"."ideas_legacy" USING "btree" ("city");



CREATE INDEX "ideas_position_idx" ON "public"."ideas_legacy" USING "btree" ("position");



CREATE INDEX "ideas_trip_idx" ON "public"."ideas" USING "btree" ("trip_id", "position");



CREATE INDEX "trip_members_user_idx" ON "public"."trip_members" USING "btree" ("user_id", "trip_id");



CREATE INDEX "trips_user_idx" ON "public"."trips" USING "btree" ("user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "ideas_set_owner" BEFORE INSERT OR UPDATE ON "public"."ideas" FOR EACH ROW EXECUTE FUNCTION "public"."set_idea_owner"();



CREATE OR REPLACE TRIGGER "ideas_touch_updated_at" BEFORE UPDATE ON "public"."ideas" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "ideas_touch_updated_at" BEFORE UPDATE ON "public"."ideas_legacy" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trips_touch_updated_at" BEFORE UPDATE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."ideas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ideas_delete" ON "public"."ideas" FOR DELETE TO "authenticated" USING ("public"."can_write_trip"("trip_id"));



CREATE POLICY "ideas_insert" ON "public"."ideas" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_write_trip"("trip_id"));



ALTER TABLE "public"."ideas_legacy" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ideas_select" ON "public"."ideas" FOR SELECT TO "authenticated" USING ("public"."can_read_trip"("trip_id"));



CREATE POLICY "ideas_update" ON "public"."ideas" FOR UPDATE TO "authenticated" USING ("public"."can_write_trip"("trip_id")) WITH CHECK ("public"."can_write_trip"("trip_id"));



ALTER TABLE "public"."trip_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_members_delete" ON "public"."trip_members" FOR DELETE TO "authenticated" USING ("public"."owns_trip"("trip_id"));



CREATE POLICY "trip_members_select" ON "public"."trip_members" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."owns_trip"("trip_id")));



CREATE POLICY "trip_members_update" ON "public"."trip_members" FOR UPDATE TO "authenticated" USING ("public"."owns_trip"("trip_id")) WITH CHECK (("public"."owns_trip"("trip_id") AND ("access" = ANY (ARRAY['read'::"text", 'write'::"text"]))));



ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trips_delete" ON "public"."trips" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "trips_insert" ON "public"."trips" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "trips_select" ON "public"."trips" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."can_read_trip"("id")));



CREATE POLICY "trips_update" ON "public"."trips" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."can_read_trip"("target_trip" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_trip"("target_trip" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_trip"("target_trip" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_trip"("target_trip" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_write_trip"("target_trip" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_write_trip"("target_trip" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_write_trip"("target_trip" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_write_trip"("target_trip" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."owns_trip"("trip" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owns_trip"("trip" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."owns_trip"("trip" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_trip"("trip" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_idea_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_idea_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_idea_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_idea_owner"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."share_trip"("target_trip" "uuid", "target_email" "text", "target_access" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."share_trip"("target_trip" "uuid", "target_email" "text", "target_access" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."share_trip"("target_trip" "uuid", "target_email" "text", "target_access" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."share_trip"("target_trip" "uuid", "target_email" "text", "target_access" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."ideas" TO "anon";
GRANT ALL ON TABLE "public"."ideas" TO "authenticated";
GRANT ALL ON TABLE "public"."ideas" TO "service_role";



GRANT ALL ON TABLE "public"."ideas_legacy" TO "anon";
GRANT ALL ON TABLE "public"."ideas_legacy" TO "authenticated";
GRANT ALL ON TABLE "public"."ideas_legacy" TO "service_role";



GRANT ALL ON TABLE "public"."trip_members" TO "anon";
GRANT ALL ON TABLE "public"."trip_members" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_members" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";
