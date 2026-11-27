# Next.js template

This is a Next.js template with shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```

## Cloudflare Workers

The platform deploys to Cloudflare Workers through `vinext`.

```bash
pnpm dev:vinext
pnpm build:vinext
pnpm deploy:vinext
```

`NEXT_PUBLIC_API_URL` is inlined at build time and must point at the Cloud API.
Workers are deployed to `veto-platform`; attach the production custom domain in
the Cloudflare dashboard when needed.

Authenticate the deploy CLI with `pnpm exec cf auth login`, or provide a
`CLOUDFLARE_API_TOKEN` in CI before running `deploy:vinext`.
