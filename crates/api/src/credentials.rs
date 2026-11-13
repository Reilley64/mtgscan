use axum::http::{HeaderMap, header};

pub(super) fn authorization(headers: &HeaderMap) -> Option<&str> {
    if headers.get_all(header::AUTHORIZATION).iter().count() != 1 {
        return None;
    }
    headers.get(header::AUTHORIZATION)?.to_str().ok()
}

pub(super) fn bearer(authorization: Option<&str>) -> Option<&str> {
    let (scheme, credential) = authorization?.split_once(' ')?;
    (scheme.eq_ignore_ascii_case("bearer")
        && !credential.is_empty()
        && !credential.chars().any(char::is_whitespace))
    .then_some(credential)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_one_well_formed_bearer_credential_is_selected() {
        for value in [
            None,
            Some("Basic token"),
            Some("Bearer "),
            Some("Bearer two tokens"),
            Some("Bearer token\t"),
        ] {
            assert_eq!(bearer(value), None);
        }
        assert_eq!(bearer(Some("bEaReR credential")), Some("credential"));
        let mut headers = HeaderMap::new();
        assert_eq!(authorization(&headers), None);
        headers.insert(header::AUTHORIZATION, "Bearer first".parse().unwrap());
        assert_eq!(bearer(authorization(&headers)), Some("first"));
        headers.append(header::AUTHORIZATION, "Bearer second".parse().unwrap());
        assert_eq!(authorization(&headers), None);
    }
}
