use mtgscan_application::organization::{
    OrganizationStore, OrganizationTransaction, Problem, ProtectableCopy, UserTag,
};
use mtgscan_domain::Caller;
use sqlx::{
    PgPool, Postgres, Row, Transaction,
    postgres::{PgPoolOptions, PgRow},
};
use std::time::Duration;

pub struct PostgresOrganization {
    pool: PgPool,
}

impl PostgresOrganization {
    pub fn connect_lazy(url: &str) -> Result<Self, &'static str> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(10))
            .connect_lazy(url)
            .map_err(|_| "Invalid collection organization database URL")?;
        Ok(Self { pool })
    }
}

pub struct OrganizationPostgresTransaction {
    tx: Transaction<'static, Postgres>,
    owner: String,
}

fn unavailable(_: sqlx::Error) -> Problem {
    Problem::unavailable()
}
fn unique(error: sqlx::Error, field: &str) -> Problem {
    if error.as_database_error().is_some_and(|error| {
        error.constraint() == Some("user_tags_name") && error.is_unique_violation()
    }) {
        Problem::new("user_tag_exists", Some(field))
    } else {
        unavailable(error)
    }
}

impl OrganizationStore for PostgresOrganization {
    type Transaction = OrganizationPostgresTransaction;
    async fn begin(&self, caller: &Caller) -> Result<Self::Transaction, Problem> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let allowed: bool = sqlx::query_scalar(
            "select current_user = 'mtgscan_collection_organizer' and session_user = current_user
             and not (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication or rolinherit)
             and not exists (select 1 from pg_catalog.pg_auth_members where member = role.oid)
             from pg_catalog.pg_roles role where rolname = current_user",
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(unavailable)?;
        if !allowed {
            return Err(Problem::unavailable());
        }
        let claims = serde_json::json!({"sub":caller.collection_owner(), "client_id":if caller.is_ai_client() { Some(caller.actor_id()) } else { None }});
        sqlx::query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)")
            .bind(claims.to_string()).bind(caller.collection_owner()).execute(&mut *tx).await.map_err(unavailable)?;
        sqlx::query(
            "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 286))",
        )
        .bind(caller.collection_owner())
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        Ok(OrganizationPostgresTransaction {
            tx,
            owner: caller.collection_owner().into(),
        })
    }
}

const USER_TAGS: &str = "select t.id::text, t.name, t.deleted_at is not null as deleted,
    (select count(*) from public.copy_user_tags l where l.user_id=t.user_id and l.user_tag_id=t.id and l.deleted_at is null) as copy_count
    from public.user_tags t where t.user_id=$1::uuid";

fn user_tag_row(row: PgRow) -> Result<UserTag, Problem> {
    Ok(UserTag {
        user_tag_id: row.try_get("id").map_err(unavailable)?,
        name: row.try_get("name").map_err(unavailable)?,
        deleted: row.try_get("deleted").map_err(unavailable)?,
        copy_count: row.try_get("copy_count").map_err(unavailable)?,
    })
}

impl OrganizationTransaction for OrganizationPostgresTransaction {
    async fn lock_copy(&mut self, id: &str) -> Result<Option<ProtectableCopy>, Problem> {
        let found: Option<String> = sqlx::query_scalar(
            "select id::text from public.copies where user_id=$1::uuid and id=$2::uuid for update",
        )
        .bind(&self.owner)
        .bind(id)
        .fetch_optional(&mut *self.tx)
        .await
        .map_err(unavailable)?;
        if found.is_none() {
            return Ok(None);
        }
        let row = sqlx::query("select exists(select 1 from public.deck_cards where user_id=$1::uuid and copy_id=$2::uuid) as allocated,
            exists(select 1 from public.planned_swaps where user_id=$1::uuid and incoming_copy_id=$2::uuid and status='open') as held")
            .bind(&self.owner).bind(id).fetch_one(&mut *self.tx).await.map_err(unavailable)?;
        Ok(Some(ProtectableCopy {
            owner_id: self.owner.clone(),
            copy_id: id.into(),
            allocated: row.try_get("allocated").map_err(unavailable)?,
            held: row.try_get("held").map_err(unavailable)?,
        }))
    }

    async fn protect(&mut self, id: &str, protected: bool) -> Result<(), Problem> {
        sqlx::query(
            "update public.copies set is_protected=$3 where user_id=$1::uuid and id=$2::uuid",
        )
        .bind(&self.owner)
        .bind(id)
        .bind(protected)
        .execute(&mut *self.tx)
        .await
        .map_err(unavailable)?;
        Ok(())
    }

    async fn find_user_tag_by_name(&mut self, name: &str) -> Result<Option<UserTag>, Problem> {
        sqlx::query(&format!(
            "{USER_TAGS} and t.deleted_at is null and lower(t.name)=lower($2)"
        ))
        .bind(&self.owner)
        .bind(name)
        .fetch_optional(&mut *self.tx)
        .await
        .map_err(unavailable)?
        .map(user_tag_row)
        .transpose()
    }

    async fn create_user_tag(&mut self, name: &str) -> Result<(UserTag, bool), Problem> {
        let id: Option<String> = sqlx::query_scalar("insert into public.user_tags (user_id, name) values ($1::uuid,$2)
            on conflict (user_id, lower(name)) where deleted_at is null do nothing returning id::text")
            .bind(&self.owner).bind(name).fetch_optional(&mut *self.tx).await.map_err(unavailable)?;
        match id {
            Some(id) => Ok((
                self.user_tag(&id).await?.ok_or_else(Problem::unavailable)?,
                true,
            )),
            None => Ok((
                self.find_user_tag_by_name(name)
                    .await?
                    .ok_or_else(Problem::unavailable)?,
                false,
            )),
        }
    }

    async fn user_tags(&mut self, deleted: bool) -> Result<Vec<UserTag>, Problem> {
        sqlx::query(&format!(
            "{USER_TAGS} and (t.deleted_at is not null)=$2 order by lower(t.name),t.name,t.id"
        ))
        .bind(&self.owner)
        .bind(deleted)
        .fetch_all(&mut *self.tx)
        .await
        .map_err(unavailable)?
        .into_iter()
        .map(user_tag_row)
        .collect()
    }

    async fn user_tag(&mut self, id: &str) -> Result<Option<UserTag>, Problem> {
        sqlx::query(
            "select id from public.user_tags where user_id=$1::uuid and id=$2::uuid for update",
        )
        .bind(&self.owner)
        .bind(id)
        .fetch_optional(&mut *self.tx)
        .await
        .map_err(unavailable)?;
        sqlx::query(&format!("{USER_TAGS} and t.id=$2::uuid"))
            .bind(&self.owner)
            .bind(id)
            .fetch_optional(&mut *self.tx)
            .await
            .map_err(unavailable)?
            .map(user_tag_row)
            .transpose()
    }

    async fn rename_user_tag(&mut self, id: &str, name: &str) -> Result<(), Problem> {
        sqlx::query("update public.user_tags set name=$3 where user_id=$1::uuid and id=$2::uuid")
            .bind(&self.owner)
            .bind(id)
            .bind(name)
            .execute(&mut *self.tx)
            .await
            .map_err(|e| unique(e, "name"))?;
        Ok(())
    }

    async fn delete_user_tag(&mut self, id: &str, deleted: bool) -> Result<(), Problem> {
        sqlx::query("update public.user_tags set deleted_at=case when $3 then now() else null end where user_id=$1::uuid and id=$2::uuid")
            .bind(&self.owner).bind(id).bind(deleted).execute(&mut *self.tx).await.map_err(|e| unique(e, "user_tag_id"))?;
        Ok(())
    }

    async fn set_user_tag(
        &mut self,
        id: &str,
        copies: &[String],
        tagged: bool,
    ) -> Result<(), Problem> {
        if tagged {
            sqlx::query("insert into public.copy_user_tags (user_id,copy_id,user_tag_id)
                select $1::uuid, chosen.copy_id::uuid, $2::uuid from unnest($3::text[]) as chosen(copy_id)
                on conflict (user_id,copy_id,user_tag_id) do update set deleted_at=null where public.copy_user_tags.deleted_at is not null")
                .bind(&self.owner).bind(id).bind(copies).execute(&mut *self.tx).await.map_err(unavailable)?;
        } else {
            sqlx::query("update public.copy_user_tags set deleted_at=now() where user_id=$1::uuid and user_tag_id=$2::uuid
                and copy_id=any($3::text[]::uuid[]) and deleted_at is null")
                .bind(&self.owner).bind(id).bind(copies).execute(&mut *self.tx).await.map_err(unavailable)?;
        }
        Ok(())
    }

    async fn commit(self) -> Result<(), Problem> {
        self.tx.commit().await.map_err(unavailable)
    }
}
