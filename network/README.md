# Home access and Pi-hole/Tailscale plan

The owner console is enforced directly by the production Worker. It compares
Cloudflare's verified connecting IPv4 address with one private `/32` stored in
D1. No Cloudflare Zero Trust subscription or identity provider is required.

The ISP address is dynamic, so `update-home-access.py` is intended to run on an
always-on home device after the Pi is rebuilt. Its authenticated heartbeat lets
the Worker learn the connection's current public IPv4 without giving the Pi a
Cloudflare account API token.

## Pi installation outline

1. Install Pi-hole and Tailscale using their current official instructions.
2. Configure the Pi as the phone's Tailscale DNS server.
3. If the phone should reach the owner console while away from home, advertise the Pi as a Tailscale exit node and explicitly select that exit node on the phone. Pi-hole DNS alone does not change the phone's public source IP.
4. Generate a long random updater token and store the same value as the Worker's
   `HOME_ACCESS_UPDATE_TOKEN` secret.
5. Create `/etc/tengen-home-access.env` owned by root with mode `0600`:

   ```text
   TENGEN_HOME_ACCESS_TOKEN=replace-with-long-random-token
   # Optional override:
   # TENGEN_HOME_ACCESS_URL=https://tengen.me/api/owner-network/heartbeat
   ```

6. Create the unprivileged `tengen-access` system account, place the Python script under `/usr/local/lib/tengen-home-access/`, and install the service and timer under `/etc/systemd/system/`.
7. Run the service once, verify its journal contains the expected `/32` without errors, and then enable the timer.

The updater token can move the owner allowlist to the caller's public address,
so treat it like a password. Never place it in this repository, shell history,
dashboard output, or the public website. A manual D1 update through the
Cloudflare dashboard remains the recovery path if the updater is offline when
the ISP address changes.
