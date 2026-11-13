use mtgscan_identity::{HttpSupabaseAuth, SupabaseIdentity, SystemClock};
use mtgscan_persistence::PostgresCollection;
use mtgscan_server::{
    health::{Health, SupabaseDependencies},
    telemetry::Telemetry,
};
use std::{env, net::SocketAddr, sync::Arc, time::Duration};

#[tokio::main]
async fn main() -> Result<(), &'static str> {
    let telemetry = Arc::new(Telemetry::otlp()?);
    let result = run(telemetry.clone()).await;
    tokio::task::spawn_blocking(move || telemetry.shutdown())
        .await
        .map_err(|_| "Telemetry shutdown failed")?;
    result
}

async fn run(telemetry: Arc<Telemetry>) -> Result<(), &'static str> {
    let url = env::var("SUPABASE_URL").map_err(|_| "SUPABASE_URL is required")?;
    let key =
        env::var("SUPABASE_PUBLISHABLE_KEY").map_err(|_| "SUPABASE_PUBLISHABLE_KEY is required")?;
    let auth = HttpSupabaseAuth::new(&url, key.clone())?;
    let issuer = format!("{}/auth/v1", url.trim_end_matches('/'));
    let identity = Arc::new(SupabaseIdentity::new(auth, SystemClock, issuer));
    let database_url =
        env::var("COLLECTION_DATABASE_URL").map_err(|_| "COLLECTION_DATABASE_URL is required")?;
    let database = PostgresCollection::connect(&database_url).await?;
    let dependencies = SupabaseDependencies::new(database.clone(), &url, key)?;
    let health = Health::default();
    let routes = telemetry.instrument(
        mtgscan_api::router(identity.clone())
            .merge(mtgscan_api::collection::router(identity, database))
            .merge(mtgscan_server::health::router(health.clone())),
    );
    let address: SocketAddr = env::var("LISTEN_ADDRESS")
        .unwrap_or_else(|_| "127.0.0.1:8080".into())
        .parse()
        .map_err(|_| "Invalid listen address")?;
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .map_err(|_| "Could not bind API")?;
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .map_err(|_| "Could not register termination signal")?;
    let probe_health = health.clone();
    let probe = tokio::spawn(async move {
        loop {
            probe_health.refresh(&dependencies).await;
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let server = axum::serve(listener, routes)
        .with_graceful_shutdown(async {
            let _ = stopped.await;
        })
        .into_future();
    tokio::pin!(server);
    let result = tokio::select! {
        result = &mut server => result.map_err(|_| "API stopped unexpectedly"),
        () = health.shutdown_when(async {
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {},
                _ = terminate.recv() => {},
            }
        }) => {
            let _ = stop.send(());
            mtgscan_server::health::finish_requests(&mut server).await
        }
    };
    probe.abort();
    let _ = probe.await;
    result
}
