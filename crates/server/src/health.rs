use axum::{
    Router,
    extract::State,
    http::{StatusCode, header},
    response::IntoResponse,
    routing::get,
};
use std::{
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
    },
    time::Duration,
};

const READY: u8 = 1;
const DRAINING: u8 = 2;

pub trait Dependencies: Send + Sync {
    fn ready(&self) -> impl Future<Output = bool> + Send;
}

pub struct SupabaseDependencies {
    database: mtgscan_persistence::PostgresCollection,
    client: reqwest::Client,
    auth_health: String,
    key: String,
}

impl SupabaseDependencies {
    pub fn new(
        database: mtgscan_persistence::PostgresCollection,
        url: &str,
        key: String,
    ) -> Result<Self, &'static str> {
        Ok(Self {
            database,
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(1))
                .build()
                .map_err(|_| "Could not configure health client")?,
            auth_health: format!("{}/auth/v1/health", url.trim_end_matches('/')),
            key,
        })
    }
}

impl Dependencies for SupabaseDependencies {
    async fn ready(&self) -> bool {
        let (database, auth) = tokio::join!(
            self.database.is_ready(),
            self.client
                .get(&self.auth_health)
                .header("apikey", &self.key)
                .send(),
        );
        database && auth.is_ok_and(|response| response.status().is_success())
    }
}

#[derive(Clone, Default)]
pub struct Health {
    state: Arc<AtomicU8>,
}

impl Health {
    pub async fn refresh(&self, dependencies: &impl Dependencies) {
        let ready = tokio::time::timeout(Duration::from_secs(1), dependencies.ready())
            .await
            .unwrap_or(false);
        let _ = self
            .state
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |state| {
                (state != DRAINING).then_some(u8::from(ready))
            });
    }

    pub async fn shutdown_when(&self, signal: impl Future<Output = ()>) {
        signal.await;
        self.state.store(DRAINING, Ordering::SeqCst);
    }
}

pub async fn finish_requests(
    server: impl Future<Output = std::io::Result<()>>,
) -> Result<(), &'static str> {
    match tokio::time::timeout(Duration::from_secs(20), server).await {
        Ok(result) => result.map_err(|_| "API stopped unexpectedly"),
        Err(_) => Err("API drain deadline exceeded"),
    }
}

pub fn router(health: Health) -> Router {
    Router::new()
        .route("/health", get(readiness))
        .route("/health/live", get(|| async { reply(true) }))
        .with_state(health)
}

async fn readiness(State(health): State<Health>) -> impl IntoResponse {
    reply(health.state.load(Ordering::SeqCst) == READY)
}

fn reply(ready: bool) -> impl IntoResponse {
    (
        if ready {
            StatusCode::OK
        } else {
            StatusCode::SERVICE_UNAVAILABLE
        },
        [(header::CACHE_CONTROL, "no-store")],
        if ready { "ok" } else { "unavailable" },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;

    struct Supabase(bool);

    impl Dependencies for Supabase {
        async fn ready(&self) -> bool {
            self.0
        }
    }

    #[tokio::test]
    async fn a_supabase_outage_removes_readiness_without_failing_process_liveness() {
        let health = Health::default();
        health.refresh(&Supabase(true)).await;
        let routes = router(health.clone());
        assert_eq!(status(routes.clone(), "/health").await, 200);
        health.refresh(&Supabase(false)).await;
        assert_eq!(status(routes.clone(), "/health").await, 503);
        assert_eq!(status(routes, "/health/live").await, 200);
    }

    #[tokio::test]
    async fn shutdown_refuses_new_traffic_even_if_an_in_flight_probe_recovers() {
        let health = Health::default();
        assert_eq!(status(router(health.clone()), "/health").await, 503);
        health.refresh(&Supabase(true)).await;
        health.shutdown_when(async {}).await;
        health.refresh(&Supabase(true)).await;
        assert_eq!(status(router(health.clone()), "/health").await, 503);
        assert_eq!(status(router(health), "/health/live").await, 200);
    }

    #[tokio::test(start_paused = true)]
    async fn a_hung_dependency_has_a_bounded_probe_and_can_recover() {
        struct Hung;
        impl Dependencies for Hung {
            async fn ready(&self) -> bool {
                std::future::pending().await
            }
        }
        let health = Health::default();
        health.refresh(&Supabase(true)).await;
        health.refresh(&Hung).await;
        assert_eq!(status(router(health.clone()), "/health").await, 503);
        health.refresh(&Supabase(true)).await;
        assert_eq!(status(router(health), "/health").await, 200);
    }

    #[tokio::test(start_paused = true)]
    async fn shutdown_allows_requests_to_finish_but_bounds_stuck_streams() {
        assert_eq!(finish_requests(async { Ok(()) }).await, Ok(()));
        let start = tokio::time::Instant::now();
        assert_eq!(
            finish_requests(std::future::pending()).await,
            Err("API drain deadline exceeded")
        );
        assert_eq!(start.elapsed(), Duration::from_secs(20));
        assert_eq!(
            finish_requests(async { Err(std::io::Error::other("private-data")) }).await,
            Err("API stopped unexpectedly")
        );
    }

    async fn status(routes: axum::Router, path: &str) -> u16 {
        let reply = routes
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(reply.headers()["cache-control"], "no-store");
        reply.status().as_u16()
    }
}
