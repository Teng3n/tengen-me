# Home access and Pi-hole/Tailscale plan

The owner console uses Cloudflare Access with two simultaneous requirements:

1. the authenticated owner identity; and
2. the current home public IPv4 address as a `/32` rule.

The ISP address is dynamic, so `update-home-access.py` is intended to run on an always-on home device after the Pi is rebuilt. It changes only the IP requirement in one reusable Access policy. It does not update DNS, applications, identity rules, or other Cloudflare settings.

## Pi installation outline

1. Install Pi-hole and Tailscale using their current official instructions.
2. Configure the Pi as the phone's Tailscale DNS server.
3. If the phone should reach the owner console while away from home, advertise the Pi as a Tailscale exit node and explicitly select that exit node on the phone. Pi-hole DNS alone does not change the phone's public source IP.
4. Create a Cloudflare API token with only **Access: Apps and Policies Write**, narrowed to the owner policy when resource-scoped roles are available.
5. Create `/etc/tengen-home-access.env` owned by root with mode `0600`:

   ```text
   CF_ACCOUNT_ID=replace-with-account-id
   CF_ACCESS_POLICY_ID=replace-with-reusable-policy-id
   CF_API_TOKEN=replace-with-scoped-token
   ```

6. Create the unprivileged `tengen-access` system account, place the Python script under `/usr/local/lib/tengen-home-access/`, and install the service and timer under `/etc/systemd/system/`.
7. Run the service once, verify its journal contains the expected `/32` without errors, and then enable the timer.

Never place the API token in this repository, shell history, dashboard output, or the public website. Cloudflare dashboard access remains the recovery path if the updater is offline when the ISP address changes.
