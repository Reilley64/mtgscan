use mtgscan_application::organization::{Command, Outcome, Problem, UserTag};
use serde_json::{Value, json};

fn invalid(field: Option<&str>) -> Problem {
    Problem::new("invalid_argument", field)
}

fn text<'a>(value: &'a Value, field: &str) -> Result<&'a str, Problem> {
    value
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| invalid(Some(field)))
}

fn id_value(value: &Value, field: &str) -> Result<String, Problem> {
    let raw = value.as_str().ok_or_else(|| invalid(Some(field)))?;
    if raw.len() != 36
        || [8, 13, 18, 23]
            .iter()
            .any(|index| raw.as_bytes()[*index] != b'-')
    {
        return Err(invalid(Some(field)));
    }
    uuid::Uuid::parse_str(raw)
        .map(|id| id.to_string())
        .map_err(|_| invalid(Some(field)))
}

fn id(value: &Value, field: &str) -> Result<String, Problem> {
    id_value(&value[field], field)
}

fn boolean(value: &Value, field: &str) -> Result<bool, Problem> {
    value
        .get(field)
        .and_then(Value::as_bool)
        .ok_or_else(|| invalid(Some(field)))
}

pub fn parse(value: Value) -> Result<Command, Problem> {
    let object = value.as_object().ok_or_else(|| invalid(None))?;
    let action = text(&value, "action")?;
    let (required, optional): (&[&str], &[&str]) = match action {
        "list_user_tags" => (&[], &["deleted"]),
        "create_user_tag" => (&["name"], &[]),
        "rename_user_tag" => (&["user_tag_id", "name"], &[]),
        "delete_user_tag" | "restore_user_tag" => (&["user_tag_id"], &[]),
        "set_copy_protected" => (&["copy_id", "protected"], &[]),
        "set_copy_user_tag" => (&["copy_id", "user_tag_id", "tagged"], &[]),
        "set_copies_user_tag" => (&["copy_ids", "user_tag_id", "tagged"], &[]),
        _ => return Err(invalid(Some("action"))),
    };
    for key in object.keys() {
        if key != "action" && !required.contains(&key.as_str()) && !optional.contains(&key.as_str())
        {
            return Err(invalid(Some(key)));
        }
    }
    for key in required {
        if !object.contains_key(*key) {
            return Err(invalid(Some(key)));
        }
    }
    Ok(match action {
        "list_user_tags" => Command::ListUserTags {
            deleted: if object.contains_key("deleted") {
                boolean(&value, "deleted")?
            } else {
                false
            },
        },
        "create_user_tag" => Command::CreateUserTag {
            name: text(&value, "name")?.into(),
        },
        "rename_user_tag" => Command::RenameUserTag {
            user_tag_id: id(&value, "user_tag_id")?,
            name: text(&value, "name")?.into(),
        },
        "delete_user_tag" => Command::DeleteUserTag {
            user_tag_id: id(&value, "user_tag_id")?,
        },
        "restore_user_tag" => Command::RestoreUserTag {
            user_tag_id: id(&value, "user_tag_id")?,
        },
        "set_copy_protected" => Command::Protect {
            copy_id: id(&value, "copy_id")?,
            protected: boolean(&value, "protected")?,
        },
        "set_copy_user_tag" => Command::SetUserTag {
            user_tag_id: id(&value, "user_tag_id")?,
            copy_ids: vec![id(&value, "copy_id")?],
            tagged: boolean(&value, "tagged")?,
            single: true,
        },
        "set_copies_user_tag" => {
            let copies = value["copy_ids"]
                .as_array()
                .ok_or_else(|| invalid(Some("copy_ids")))?;
            let copy_ids = copies
                .iter()
                .enumerate()
                .map(|(index, value)| id_value(value, &format!("copy_ids[{index}]")))
                .collect::<Result<_, _>>()?;
            Command::SetUserTag {
                user_tag_id: id(&value, "user_tag_id")?,
                copy_ids,
                tagged: boolean(&value, "tagged")?,
                single: false,
            }
        }
        _ => unreachable!(),
    })
}

fn user_tag_value(user_tag: UserTag) -> Value {
    json!({"user_tag_id":user_tag.user_tag_id,"name":user_tag.name})
}

pub fn result(outcome: Outcome, ai: bool) -> Value {
    match outcome {
        Outcome::Protected { copy_id, protected } => {
            json!({"copy_id":copy_id,"protected":protected})
        }
        Outcome::Created { user_tag, created } => {
            let mut result = user_tag_value(user_tag);
            if ai {
                result["created"] = json!(created);
            }
            result
        }
        Outcome::UserTags(user_tags) => json!({"items": user_tags.into_iter().map(|user_tag| {
            let count = user_tag.copy_count;
            let mut value = user_tag_value(user_tag); value["copy_count"] = json!(count); value
        }).collect::<Vec<_>>()}),
        Outcome::Renamed(user_tag) => user_tag_value(user_tag),
        Outcome::Deleted {
            user_tag_id,
            changed,
            copy_count,
        } => {
            if ai {
                json!({"user_tag_id":user_tag_id,"changed":changed,"copy_count":copy_count})
            } else {
                Value::Null
            }
        }
        Outcome::Restored { user_tag, changed } => {
            let count = user_tag.copy_count;
            let mut value = user_tag_value(user_tag);
            value["changed"] = json!(changed);
            value["copy_count"] = json!(count);
            value
        }
        Outcome::UserTagLinksChanged { changed, skipped } => {
            json!({"changed":changed,"skipped":skipped.into_iter().map(|id| json!({"copy_id":id,"reason":"missing"})).collect::<Vec<_>>()})
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn organization_requests_preserve_field_errors_and_normalize_exact_ids() {
        assert_eq!(parse(json!({"action":"set_copy_protected","copy_id":"10000000-0000-4000-8000-00000000000A","protected":true})).unwrap(), Command::Protect { copy_id: "10000000-0000-4000-8000-00000000000a".into(), protected: true });
        for (value, field) in [
            (
                json!({"action":"create_user_tag","name":"Signed","owner":"forged"}),
                "owner",
            ),
            (json!({"action":"create_user_tag"}), "name"),
            (
                json!({"action":"set_copy_protected","copy_id":"no","protected":true}),
                "copy_id",
            ),
            (
                json!({"action":"set_copies_user_tag","user_tag_id":"10000000-0000-4000-8000-000000000001","copy_ids":["bad"],"tagged":true}),
                "copy_ids[0]",
            ),
            (
                json!({"action":"list_user_tags","deleted":"yes"}),
                "deleted",
            ),
        ] {
            assert_eq!(
                parse(value),
                Err(Problem::new("invalid_argument", Some(field)))
            );
        }
    }
}
