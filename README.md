# tengen.me

Personal site for Tengen: game-server status, infrastructure projects, and a
protected owner area.

## Stack

- Vinext / React / TypeScript
- Cloudflare Workers runtime
- GitHub as the source of truth
- Cloudflare Workers Builds for automatic deployment
- Cloudflare Access for `/admin*`

## Local development

```bash
npm install
npm run dev
```

Build and validate the Cloudflare bundle:

```bash
npm run build
npx wrangler deploy --dry-run --config dist/server/wrangler.json
```

## Deployment

Connect this repository in Cloudflare under **Workers & Pages → Create → Import
a repository**.

- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --config dist/server/wrangler.json`
- Preview deploy command: `npx wrangler versions upload --config dist/server/wrangler.json`

After the first deployment, add `tengen.me` as the custom domain. Protect
`tengen.me/admin*` with a Cloudflare Access self-hosted application restricted
to the owner’s Cloudflare account.

## Public server-status boundary

`GET /api/server-status` returns the deliberately small public schema consumed
by the server widget. Do not place private addresses, management ports,
credentials, raw logs, provider identifiers, or remote-control capabilities in
that response.
