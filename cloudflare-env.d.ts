declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BETTER_AUTH_SECRET?: string;
    SETUP_OWNER_EMAIL?: string;
    LOCAL_SETUP?: string;
  }
}
