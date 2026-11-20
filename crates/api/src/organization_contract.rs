use mtgscan_application::organization::{Command, Outcome, Problem, UserTag};
use serde_json::{Value, json};

fn invalid(field: Option<&'static str>) -> Problem {
    Problem::new("invalid_argument", field)
}

fn text<'a>(value: &'a Value, field: &'static str) -> Result<&'a str, Problem> {
    value
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| invalid(Some(field)))
}

fn id(value: &Value, field: &'static str) -> Result<String, Problem> {
    let raw = text(value, field)?;
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

fn boolean(value: &Value, field: &'static str) -> Result<bool, Problem> {
    value
        .get(field)
        .and_then(Value::as_bool)
        .ok_or_else(|| invalid(Some(field)))
}

pub(super) fn parse(value: Value) -> Result<Command, Problem> {
    let object = value.as_object().ok_or_else(|| invalid(None))?;
    let action = text(&value, "action")?;
    let fields = |allowed: &[&str]| {
        if object
            .keys()
            .any(|key| key != "action" && !allowed.contains(&key.as_str()))
        {
            return Err(invalid(None));
        }
        Ok(())
    };
    Ok(match action {
        "list_user_tags" => {
            fields(&["deleted"])?;
            Command::ListUserTags {
                deleted: object.contains_key("deleted") && boolean(&value, "deleted")?,
            }
        }
        "create_user_tag" => {
            fields(&["name"])?;
            Command::CreateUserTag {
                name: text(&value, "name")?.into(),
            }
        }
        "rename_user_tag" => {
            fields(&["user_tag_id", "name"])?;
            Command::RenameUserTag {
                user_tag_id: id(&value, "user_tag_id")?,
                name: text(&value, "name")?.into(),
            }
        }
        "delete_user_tag" | "restore_user_tag" => {
            fields(&["user_tag_id"])?;
            let user_tag_id = id(&value, "user_tag_id")?;
            if action == "delete_user_tag" {
                Command::DeleteUserTag { user_tag_id }
            } else {
                Command::RestoreUserTag { user_tag_id }
            }
        }
        "set_copy_protected" => {
            fields(&["copy_id", "protected"])?;
            Command::Protect {
                copy_id: id(&value, "copy_id")?,
                protected: boolean(&value, "protected")?,
            }
        }
        "set_copy_user_tag" => {
            fields(&["copy_id", "user_tag_id", "tagged"])?;
            Command::SetCopyUserTag {
                user_tag_id: id(&value, "user_tag_id")?,
                copy_id: id(&value, "copy_id")?,
                tagged: boolean(&value, "tagged")?,
            }
        }
        "set_copies_user_tag" => return Err(Problem::new("forbidden", None)),
        _ => return Err(invalid(Some("action"))),
    })
}

fn user_tag_value(user_tag: UserTag) -> Value {
    json!({"user_tag_id":user_tag.user_tag_id,"name":user_tag.name})
}

pub(super) fn result(outcome: Outcome) -> Value {
    match outcome {
        Outcome::Protected { copy_id, protected } => {
            json!({"copy_id":copy_id,"protected":protected})
        }
        Outcome::Created(user_tag) | Outcome::Renamed(user_tag) => user_tag_value(user_tag),
        Outcome::UserTags(user_tags) => json!({"items": user_tags.into_iter().map(|user_tag| {
            json!({"user_tag_id":user_tag.user_tag_id,"name":user_tag.name,"copy_count":user_tag.copy_count})
        }).collect::<Vec<_>>()}),
        Outcome::Restored { user_tag, changed } => json!({
            "user_tag_id":user_tag.user_tag_id,"name":user_tag.name,
            "changed":changed,"copy_count":user_tag.copy_count,
        }),
        Outcome::Deleted | Outcome::UserTagLinkChanged => Value::Null,
    }
}
