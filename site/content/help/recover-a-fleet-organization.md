---
title: Recover a Fleet organization
date: 2026-11-16
collection: operate
type: task
covers:
  - src/fleet/service/recovery.mjs
  - src/fleet/service/recoveryCommand.mjs
  - src/fleet/service/recoveryProtection.mjs
  - src/fleet/service/main.mjs
---

Restore administrator access to your existing self-hosted inventory using the service's local database credentials.

You must control the service host and its PostgreSQL credentials. Recovery revokes every session, service token and unused invitation in that organization. You keep your robot identities and inventory.

1. On the service host, set `FLEET_DATABASE_URL` to the existing service database.
2. In the repository, set `FLEET_RECOVERY_ORG` to the existing organization UUID printed during bootstrap.
3. For an organization without a recovery account, run the setup command below with an unused email and a password of at least 14 characters.
4. Run the recovery command below with a new password of at least 14 characters.
5. At your service's `/fleet` address, fill **Organization ID**, **Email** and **Password** with that organization's UUID and recovery account credentials.
6. Click **Sign In**.

![Fleet sign-in with the existing organization ID and recovery email](/help/recover-a-fleet-organization/sign-in.png)

![The recovered account viewing the original Hospital inventory](/help/recover-a-fleet-organization/inventory.png)

## Local commands

Use Python 3's hidden terminal prompt to send JSON over a pipe, as shown below. You enter the password through the prompt without putting it in the command line or shell history. You can use a secret manager to supply the same JSON through stdin. Don’t save the JSON in the repository or enable shell tracing.

Run setup once per organization in a POSIX shell:

```sh
python3 -c 'import getpass,json; print(json.dumps({"email":getpass.getpass("Recovery email: "),"password":getpass.getpass("Recovery password: ")}))' | node src/fleet/service/main.mjs recovery-setup "$FLEET_RECOVERY_ORG"
```

Recover access or rotate the password:

```sh
python3 -c 'import getpass,json; print(json.dumps({"password":getpass.getpass("New recovery password: ")}))' | node src/fleet/service/main.mjs recover "$FLEET_RECOVERY_ORG"
```

In PowerShell, use `$env:FLEET_RECOVERY_ORG` for the organization variable and `python` for the Python launcher. Use the same JSON format on Windows and Linux. The commands refuse interactive stdin, extra arguments and input exceeding 8 KiB. They print IDs or a refusal without printing the supplied password.

During setup, you create one separate local account and a protected administrator role. You can run setup after someone has deleted the ordinary administrator. The email identifies the login but provides no proof of ownership. Setup does not promote existing accounts or match them by email.

Your database access authorizes recovery. You don’t need an emailed code or an expiring recovery token. After you rotate the password, you can’t use the old password, and the service revokes all organization credentials. Issue replacement service tokens through the existing identity API after signing in.

## Inspect the recovery record

Run `node src/fleet/service/main.mjs recovery-audit "$FLEET_RECOVERY_ORG"`. The JSON contains organization, actor, action, affected identity, timestamp and outcome. You receive at most 100 records. Pass the `next` value as a final argument to get the following page.

The service keeps durable records of setup, recovery and blocked edits. On successful recovery, it commits the password, revocations and audit record together. Through normal API edits, you can’t delete the recovery account, change its password or role, or add it to groups.

Database administrators can change both authority and records. They can tamper with these records through the database. The service identifies the local operator by combining the database login, host and OS account, so operators who use shared service accounts share attribution.

Use [Host Basecase Fleet](/help/host-basecase-fleet) for service configuration and replacement service credentials.
