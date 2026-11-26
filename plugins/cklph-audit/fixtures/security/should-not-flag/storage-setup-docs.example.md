<!-- FIXTURE: security lens, should-not-flag (PRECISION). Safe lookalike: a "secret" that is a
documented example key. AKIAIOSFODNN7EXAMPLE and its secret are the placeholder credentials AWS
prints in its own documentation; they have never authenticated anything. They sit in a setup guide
next to the instruction to replace them, and the code reads the real values from the environment.
Twin: should-flag/webhook-secret-fallback.example.ts.
Expected verdict: NO FINDING. -->
# File uploads: storage setup

Uploads go to an S3 bucket. The app reads its credentials from the environment and never from
this repo.

1. Create an IAM user with `s3:PutObject` on the uploads bucket only.
2. Copy `.env.example` to `.env.local` and replace the placeholder values with that user's keys:

```bash
# .env.example
AWS_REGION=us-east-1
UPLOADS_BUCKET=acme-uploads-dev
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

3. The upload handler builds its client from those variables:

```ts
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
```

Never commit `.env.local`; it is in `.gitignore`.
