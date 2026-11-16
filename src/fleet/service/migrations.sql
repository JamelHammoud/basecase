CREATE TABLE IF NOT EXISTS fleet_schema (version integer PRIMARY KEY);
CREATE TABLE IF NOT EXISTS fleet_organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS fleet_resources (
  org uuid NOT NULL REFERENCES fleet_organizations(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('region','site','robot','role','group','account','asset')),
  parent uuid,
  ancestors uuid[] NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (org,id),
  FOREIGN KEY (org,parent) REFERENCES fleet_resources(org,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS fleet_resource_page ON fleet_resources(org,kind,id);
CREATE INDEX IF NOT EXISTS fleet_resource_scopes ON fleet_resources USING gin(ancestors);
CREATE TABLE IF NOT EXISTS fleet_passwords (
  org uuid NOT NULL,
  account uuid NOT NULL,
  email text NOT NULL,
  password text,
  PRIMARY KEY (org,account),
  UNIQUE (org,email),
  FOREIGN KEY (org,account) REFERENCES fleet_resources(org,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS fleet_credentials (
  hash text PRIMARY KEY,
  id uuid UNIQUE NOT NULL,
  org uuid NOT NULL,
  account uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('session','service','enrollment')),
  ceiling jsonb,
  expires timestamptz NOT NULL,
  FOREIGN KEY (org,account) REFERENCES fleet_resources(org,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS fleet_credentials_account ON fleet_credentials(org,account);
CREATE TABLE IF NOT EXISTS fleet_status (
  org uuid NOT NULL,
  robot uuid NOT NULL,
  generation bigint NOT NULL DEFAULT 0,
  observed_at timestamptz,
  observed_generation bigint NOT NULL DEFAULT 0,
  received_at timestamptz,
  status text,
  PRIMARY KEY (org,robot),
  FOREIGN KEY (org,robot) REFERENCES fleet_resources(org,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS fleet_ingest_events (
  org uuid NOT NULL,
  robot uuid NOT NULL,
  event text NOT NULL,
  generation bigint NOT NULL,
  PRIMARY KEY (org,robot,event),
  FOREIGN KEY (org,robot) REFERENCES fleet_resources(org,id) ON DELETE CASCADE
);
CREATE OR REPLACE FUNCTION fleet_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  payload jsonb;
BEGIN
  IF TG_TABLE_NAME='fleet_credentials' AND TG_OP='INSERT' THEN
    RETURN NEW;
  END IF;
  payload := jsonb_build_object('org',COALESCE(NEW.org,OLD.org),'kind',TG_TABLE_NAME);
  IF TG_TABLE_NAME='fleet_credentials' THEN
    payload := payload || jsonb_build_object('credential',COALESCE(NEW.id,OLD.id));
  END IF;
  PERFORM pg_notify('fleet_changes', payload::text);
  RETURN COALESCE(NEW,OLD);
END;
$$;
CREATE OR REPLACE TRIGGER fleet_resource_changed AFTER INSERT OR UPDATE OR DELETE ON fleet_resources FOR EACH ROW EXECUTE FUNCTION fleet_changed();
CREATE OR REPLACE TRIGGER fleet_credential_changed AFTER INSERT OR UPDATE OR DELETE ON fleet_credentials FOR EACH ROW EXECUTE FUNCTION fleet_changed();
CREATE OR REPLACE TRIGGER fleet_status_changed AFTER INSERT OR UPDATE ON fleet_status FOR EACH ROW EXECUTE FUNCTION fleet_changed();
INSERT INTO fleet_schema(version) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS fleet_facilities (
  org uuid NOT NULL,
  site uuid NOT NULL,
  summary jsonb NOT NULL,
  registration jsonb,
  geometry text NOT NULL,
  source bytea NOT NULL,
  PRIMARY KEY (org,site),
  FOREIGN KEY (org,site) REFERENCES fleet_resources(org,id) ON DELETE CASCADE
);
ALTER TABLE fleet_status ADD COLUMN IF NOT EXISTS pose jsonb;
ALTER TABLE fleet_status ADD COLUMN IF NOT EXISTS work jsonb;
CREATE OR REPLACE TRIGGER fleet_facility_changed AFTER INSERT OR UPDATE OR DELETE ON fleet_facilities FOR EACH ROW EXECUTE FUNCTION fleet_changed();
INSERT INTO fleet_schema(version) VALUES (2) ON CONFLICT DO NOTHING;
