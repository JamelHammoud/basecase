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

CREATE TABLE IF NOT EXISTS fleet_recovery (
  org uuid PRIMARY KEY REFERENCES fleet_organizations(id),
  id uuid NOT NULL,
  role uuid NOT NULL,
  FOREIGN KEY (org,id) REFERENCES fleet_resources(org,id) ON DELETE RESTRICT,
  FOREIGN KEY (org,role) REFERENCES fleet_resources(org,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS fleet_recovery_audit (
  sequence bigserial PRIMARY KEY,
  org uuid NOT NULL REFERENCES fleet_organizations(id),
  actor text NOT NULL,
  action text NOT NULL,
  affected uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  outcome text NOT NULL CHECK (outcome IN ('success','refused'))
);
CREATE INDEX IF NOT EXISTS fleet_recovery_audit_page ON fleet_recovery_audit(org,sequence);
INSERT INTO fleet_schema(version) VALUES (3) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS fleet_connections (
  org uuid NOT NULL REFERENCES fleet_organizations(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  issuer text NOT NULL,
  revision uuid NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (org,id),
  UNIQUE (org,issuer)
);
CREATE TABLE IF NOT EXISTS fleet_federated (
  org uuid NOT NULL,
  connection uuid NOT NULL,
  subject text NOT NULL,
  account uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  provisioned boolean NOT NULL DEFAULT false,
  deleted boolean NOT NULL DEFAULT false,
  groups jsonb NOT NULL DEFAULT '[]',
  PRIMARY KEY (org,connection,subject),
  UNIQUE (org,account),
  FOREIGN KEY (org,connection) REFERENCES fleet_connections(org,id),
  FOREIGN KEY (org,account) REFERENCES fleet_resources(org,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS fleet_saml_cache (
  org uuid NOT NULL,
  connection uuid NOT NULL,
  revision uuid NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  expires timestamptz NOT NULL,
  PRIMARY KEY (org,connection,key),
  FOREIGN KEY (org,connection) REFERENCES fleet_connections(org,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS fleet_scim_tokens (
  org uuid NOT NULL,
  connection uuid NOT NULL,
  hash text NOT NULL UNIQUE,
  expires timestamptz NOT NULL,
  PRIMARY KEY (org,connection),
  FOREIGN KEY (org,connection) REFERENCES fleet_connections(org,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS fleet_scim_groups (
  org uuid NOT NULL,
  connection uuid NOT NULL,
  id uuid NOT NULL,
  external_id text NOT NULL,
  name text NOT NULL,
  members uuid[] NOT NULL,
  PRIMARY KEY (org,connection,id),
  UNIQUE (org,connection,external_id),
  FOREIGN KEY (org,connection) REFERENCES fleet_connections(org,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS fleet_federation_policy (
  org uuid PRIMARY KEY REFERENCES fleet_organizations(id) ON DELETE CASCADE,
  enforced boolean NOT NULL DEFAULT false
);
ALTER TABLE fleet_credentials ADD COLUMN IF NOT EXISTS connection uuid;
CREATE OR REPLACE TRIGGER fleet_connection_changed AFTER INSERT OR UPDATE OR DELETE ON fleet_connections FOR EACH ROW EXECUTE FUNCTION fleet_changed();
CREATE OR REPLACE TRIGGER fleet_federated_changed AFTER UPDATE OR DELETE ON fleet_federated FOR EACH ROW EXECUTE FUNCTION fleet_changed();
CREATE OR REPLACE TRIGGER fleet_scim_group_changed AFTER INSERT OR UPDATE OR DELETE ON fleet_scim_groups FOR EACH ROW EXECUTE FUNCTION fleet_changed();
INSERT INTO fleet_schema(version) VALUES (4) ON CONFLICT DO NOTHING;
