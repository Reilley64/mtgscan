use mtgscan_identity::{HttpSupabaseAuth, SupabaseIdentity, SystemClock};
use mtgscan_persistence::PostgresCollection;
use std::{env, net::SocketAddr, sync::Arc};

#[tokio::main]
async fn main() -> Result<(), &'static str> {
    let url = env::var("SUPABASE_URL").map_err(|_| "SUPABASE_URL is required")?;
    let key =
        env::var("SUPABASE_PUBLISHABLE_KEY").map_err(|_| "SUPABASE_PUBLISHABLE_KEY is required")?;
    let auth = HttpSupabaseAuth::new(&url, key)?;
    let issuer = format!("{}/auth/v1", url.trim_end_matches('/'));
    let identity = Arc::new(SupabaseIdentity::new(auth, SystemClock, issuer));
    let database_url =
        env::var("COLLECTION_DATABASE_URL").map_err(|_| "COLLECTION_DATABASE_URL is required")?;
    let database = PostgresCollection::connect(&database_url).await?;
    let routes = mtgscan_api::router(identity.clone())
        .merge(mtgscan_api::collection::router(
            identity.clone(),
            database.clone(),
        ))
        .merge(mtgscan_api::catalog::router(identity, database));
    let address: SocketAddr = env::var("LISTEN_ADDRESS")
        .unwrap_or_else(|_| "127.0.0.1:8080".into())
        .parse()
        .map_err(|_| "Invalid listen address")?;
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .map_err(|_| "Could not bind API")?;
    axum::serve(listener, routes)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .map_err(|_| "API stopped unexpectedly")
}
