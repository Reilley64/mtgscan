use axum::{
    Router,
    extract::{MatchedPath, Request, State},
    middleware::{self, Next},
    response::Response,
};
use opentelemetry::{
    KeyValue,
    logs::{LogRecord, Logger, LoggerProvider, Severity},
    metrics::{Counter, Histogram, MeterProvider},
    trace::{Span, SpanKind, Tracer, TracerProvider},
};
use opentelemetry_sdk::{
    Resource,
    logs::{SdkLogger, SdkLoggerProvider},
    metrics::SdkMeterProvider,
    trace::{SdkTracer, SdkTracerProvider},
};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

pub struct Telemetry {
    traces: SdkTracerProvider,
    metrics: SdkMeterProvider,
    logs: SdkLoggerProvider,
    tracer: SdkTracer,
    logger: SdkLogger,
    requests: Counter<u64>,
    duration: Histogram<f64>,
}

impl Telemetry {
    pub fn otlp() -> Result<Self, &'static str> {
        use opentelemetry_otlp::WithExportConfig;
        let resource = Resource::builder()
            .with_service_name(
                std::env::var("OTEL_SERVICE_NAME").unwrap_or_else(|_| "mtgscan".into()),
            )
            .build();
        let spans = opentelemetry_otlp::SpanExporter::builder()
            .with_tonic()
            .with_timeout(Duration::from_secs(2))
            .build()
            .map_err(|_| "Could not configure trace exporter")?;
        let metrics = opentelemetry_otlp::MetricExporter::builder()
            .with_tonic()
            .with_timeout(Duration::from_secs(2))
            .build()
            .map_err(|_| "Could not configure metric exporter")?;
        let logs = opentelemetry_otlp::LogExporter::builder()
            .with_tonic()
            .with_timeout(Duration::from_secs(2))
            .build()
            .map_err(|_| "Could not configure log exporter")?;
        Ok(Self::with_providers(
            SdkTracerProvider::builder()
                .with_resource(resource.clone())
                .with_batch_exporter(spans)
                .build(),
            SdkMeterProvider::builder()
                .with_resource(resource.clone())
                .with_periodic_exporter(metrics)
                .build(),
            SdkLoggerProvider::builder()
                .with_resource(resource)
                .with_batch_exporter(logs)
                .build(),
        ))
    }

    pub fn with_providers(
        traces: SdkTracerProvider,
        metrics: SdkMeterProvider,
        logs: SdkLoggerProvider,
    ) -> Self {
        let meter = metrics.meter("mtgscan-server");
        Self {
            tracer: traces.tracer("mtgscan-server"),
            logger: logs.logger("mtgscan-server"),
            requests: meter.u64_counter("http.server.request.count").build(),
            duration: meter
                .f64_histogram("http.server.request.duration")
                .with_unit("s")
                .build(),
            traces,
            metrics,
            logs,
        }
    }

    pub fn instrument(self: &Arc<Self>, routes: Router) -> Router {
        routes.layer(middleware::from_fn_with_state(self.clone(), observe))
    }

    pub fn flush(&self) {
        let _ = self.traces.force_flush();
        let _ = self.metrics.force_flush();
        let _ = self.logs.force_flush();
    }

    pub fn shutdown(&self) {
        let _ = self.traces.shutdown_with_timeout(Duration::from_secs(1));
        let _ = self.metrics.shutdown_with_timeout(Duration::from_secs(1));
        let _ = self.logs.shutdown_with_timeout(Duration::from_secs(1));
    }
}

async fn observe(
    State(telemetry): State<Arc<Telemetry>>,
    request: Request,
    next: Next,
) -> Response {
    let method = match request.method().as_str() {
        "GET" => "GET",
        "POST" => "POST",
        "PUT" => "PUT",
        "DELETE" => "DELETE",
        "PATCH" => "PATCH",
        "HEAD" => "HEAD",
        "OPTIONS" => "OPTIONS",
        _ => "OTHER",
    };
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map_or("unmatched", |path| path.as_str())
        .to_owned();
    let mut attributes = vec![
        KeyValue::new("http.request.method", method),
        KeyValue::new("http.route", route),
    ];
    let mut span = telemetry
        .tracer
        .span_builder("HTTP request")
        .with_kind(SpanKind::Server)
        .start(&telemetry.tracer);
    let start = Instant::now();
    let response = next.run(request).await;
    attributes.push(KeyValue::new(
        "http.response.status_code",
        i64::from(response.status().as_u16()),
    ));
    telemetry.requests.add(1, &attributes);
    telemetry
        .duration
        .record(start.elapsed().as_secs_f64(), &attributes);
    if response.status().is_server_error() {
        span.set_status(opentelemetry::trace::Status::error("HTTP server error"));
    }
    span.set_attributes(attributes.clone());
    let mut log = telemetry.logger.create_log_record();
    log.set_body("HTTP response".into());
    log.set_severity_number(Severity::Info);
    log.set_trace_context(
        span.span_context().trace_id(),
        span.span_context().span_id(),
        Some(span.span_context().trace_flags()),
    );
    log.add_attributes(attributes.into_iter().map(|pair| {
        (
            pair.key,
            opentelemetry::logs::AnyValue::from(pair.value.to_string()),
        )
    }));
    telemetry.logger.emit(log);
    span.end();
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, body::Body, http::Request, routing::get};
    use opentelemetry_sdk::{
        logs::InMemoryLogExporter, metrics::InMemoryMetricExporter, trace::InMemorySpanExporter,
    };
    use tower::ServiceExt;

    #[tokio::test]
    async fn server_failures_are_errors_without_recording_unmatched_paths_or_custom_methods() {
        let spans = InMemorySpanExporter::default();
        let telemetry = Arc::new(Telemetry::with_providers(
            SdkTracerProvider::builder()
                .with_simple_exporter(spans.clone())
                .build(),
            SdkMeterProvider::default(),
            SdkLoggerProvider::builder().build(),
        ));
        let routes = telemetry.instrument(
            Router::new().fallback(|| async { axum::http::StatusCode::SERVICE_UNAVAILABLE }),
        );
        routes
            .oneshot(
                Request::builder()
                    .method("private-method")
                    .uri("/private-path?token=private-query")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        telemetry.flush();
        let exported = spans.get_finished_spans().unwrap();
        assert_eq!(exported.len(), 1);
        assert_eq!(
            exported[0].attributes,
            vec![
                KeyValue::new("http.request.method", "OTHER"),
                KeyValue::new("http.route", "unmatched"),
                KeyValue::new("http.response.status_code", 503_i64),
            ]
        );
        assert_eq!(
            exported[0].status,
            opentelemetry::trace::Status::error("HTTP server error")
        );
        telemetry.shutdown();
        assert!(spans.is_shutdown_called());
    }

    #[tokio::test]
    async fn http_exports_metrics_logs_and_traces_without_caller_data() {
        let spans = InMemorySpanExporter::default();
        let logs = InMemoryLogExporter::default();
        let metrics = InMemoryMetricExporter::default();
        let telemetry = Arc::new(Telemetry::with_providers(
            SdkTracerProvider::builder()
                .with_simple_exporter(spans.clone())
                .build(),
            SdkMeterProvider::builder()
                .with_periodic_exporter(metrics.clone())
                .build(),
            SdkLoggerProvider::builder()
                .with_simple_exporter(logs.clone())
                .build(),
        ));
        let routes = telemetry.instrument(Router::new().route(
            "/copies/{copy_id}",
            get(|| async { axum::http::StatusCode::FORBIDDEN }),
        ));
        let response = routes
            .oneshot(
                Request::builder()
                    .uri("/copies/private-copy?token=private-query")
                    .header("authorization", "Bearer private-token")
                    .body(Body::from("private-body"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 403);
        telemetry.flush();
        let spans = spans.get_finished_spans().unwrap();
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].name, "HTTP request");
        assert_eq!(
            spans[0].attributes,
            vec![
                KeyValue::new("http.request.method", "GET"),
                KeyValue::new("http.route", "/copies/{copy_id}"),
                KeyValue::new("http.response.status_code", 403_i64),
            ]
        );
        let logs = logs.get_emitted_logs().unwrap();
        assert_eq!(logs.len(), 1);
        let metrics = metrics.get_finished_metrics().unwrap();
        let names: Vec<_> = metrics
            .iter()
            .flat_map(|batch| batch.scope_metrics())
            .flat_map(|scope| scope.metrics())
            .map(|metric| metric.name())
            .collect();
        assert!(names.contains(&"http.server.request.count"));
        assert!(names.contains(&"http.server.request.duration"));
        use opentelemetry_sdk::metrics::data::{AggregatedMetrics, MetricData};
        for metric in metrics
            .iter()
            .flat_map(|batch| batch.scope_metrics())
            .flat_map(|scope| scope.metrics())
        {
            match metric.data() {
                AggregatedMetrics::U64(MetricData::Sum(sum)) => {
                    assert_eq!(sum.data_points().map(|point| point.value()).sum::<u64>(), 1)
                }
                AggregatedMetrics::F64(MetricData::Histogram(histogram)) => assert_eq!(
                    histogram
                        .data_points()
                        .map(|point| point.count())
                        .sum::<u64>(),
                    1
                ),
                _ => panic!("Expected a request count or duration"),
            }
        }
        assert_eq!(
            logs[0].record.trace_context().unwrap().trace_id,
            spans[0].span_context.trace_id()
        );
        for output in [
            format!("{spans:?}"),
            format!("{logs:?}"),
            format!("{metrics:?}"),
        ] {
            assert!(!output.contains("private-"));
        }
    }
}
