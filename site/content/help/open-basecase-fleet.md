---
title: Open Basecase Fleet
date: 2026-11-16
collection: operate
type: task
covers:
  - src/fleet/FleetLauncher.tsx
  - src/fleet/openFleet.ts
  - src/fleet/browser/
  - src/workspace/operateCommands.tsx
---

View the robots your account can access across a self-hosted organization's sites.

You need a running Fleet service, an organization ID and either an enrolled local account or a connected SSO provider. Fleet requires HTTPS outside loopback.

1. In **Play**, choose **Operate**.
2. In **Fleet address**, enter your service's address.
3. Click **Open Fleet**.

![Operate with the Fleet address and Open Fleet control](/help/open-basecase-fleet/operate.png)

4. In **Organization ID**, enter the ID from your Fleet administrator.
5. In **Email**, enter your account's email.
6. In **Password**, enter your password.
7. Click **Sign In**.

![Fleet sign-in with organization, email and password fields](/help/open-basecase-fleet/sign-in.png)

8. In **Site**, choose the site whose robots you want to view.

![The Ward A viewer's inventory with Delivery 01 marked stale](/help/open-basecase-fleet/inventory.png)

For SSO, enter the organization ID and click **Sign In with SSO**, then choose your provider. [Connect identity providers to Fleet](/help/federate-fleet-identities) covers setup.

You can view only the sites and robots your account can access. A robot marked **Stale** has no observation from the last 60 seconds. Disconnecting a robot leaves its identity in the inventory.

You can press [[⌘K]] and choose **Open Fleet**. To ground a floorplan or twin, use [Register a Fleet facility](/help/register-a-fleet-facility). To open another page, use **Next Sites** or **Next Robots** when a page is available.

If access changes or the connection closes, the list clears. Click **Reload Fleet** to check access again. Click **Sign Out** to revoke the browser session.

![Fleet clears its inventory after the viewer's role changes](/help/open-basecase-fleet/access-reset.png)

## Enroll an account

Open the enrollment link from your Fleet administrator. It opens the password form even when you are signed in to another account.

1. In **Password**, enter at least 14 characters.
2. Click **Enroll**.

![The enrollment form with a new password entered](/help/open-basecase-fleet/enroll.png)

See [Host Basecase Fleet](/help/host-basecase-fleet) for service setup and role administration.
