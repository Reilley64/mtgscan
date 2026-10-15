
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "card_faces": {
                  Row: {
                    "colors": (string)[],"face_index": number,"loyalty": string | null,"mana_cost": string,"name": string,"oracle_id": string,"oracle_text": string,"power": string | null,"toughness": string | null,"type_line": string
                  }
                  ComputedFields: never
                  Insert: {
                    "colors": (string)[],"face_index": number,"loyalty"?: string | null,"mana_cost": string,"name": string,"oracle_id": string,"oracle_text": string,"power"?: string | null,"toughness"?: string | null,"type_line": string
                  }
                  Update: {
                    "colors"?: (string)[],"face_index"?: number,"loyalty"?: string | null,"mana_cost"?: string,"name"?: string,"oracle_id"?: string,"oracle_text"?: string,"power"?: string | null,"toughness"?: string | null,"type_line"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_faces_oracle_id_fkey"
      columns: ["oracle_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["oracle_id"]
    }
                  ]
                },"card_lowest_prices": {
                  Row: {
                    "finish": Database["public"]['Enums']["card_finish"],"oracle_id": string,"usd_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "finish": Database["public"]['Enums']["card_finish"],"oracle_id": string,"usd_cents": number
                  }
                  Update: {
                    "finish"?: Database["public"]['Enums']["card_finish"],"oracle_id"?: string,"usd_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_lowest_prices_oracle_id_fkey"
      columns: ["oracle_id"]
isOneToOne: true
      referencedRelation: "cards"
      referencedColumns: ["oracle_id"]
    }
                  ]
                },"card_prices": {
                  Row: {
                    "printing_id": string,"usd_etched_cents": number | null,"usd_foil_cents": number | null,"usd_nonfoil_cents": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "printing_id": string,"usd_etched_cents"?: number | null,"usd_foil_cents"?: number | null,"usd_nonfoil_cents"?: number | null
                  }
                  Update: {
                    "printing_id"?: string,"usd_etched_cents"?: number | null,"usd_foil_cents"?: number | null,"usd_nonfoil_cents"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_prices_printing_id_fkey"
      columns: ["printing_id"]
isOneToOne: true
      referencedRelation: "card_printings"
      referencedColumns: ["id"]
    }
                  ]
                },"card_printings": {
                  Row: {
                    "absent_since": string | null,"art_crop_uri": string | null,"collector_number": string,"finishes": (Database["public"]['Enums']["card_finish"])[],"id": string,"illustration_id": string | null,"image_uris": (string)[],"lang": string,"oracle_id": string,"rarity": Database["public"]['Enums']["card_rarity"],"released_at": string,"set_code": string,"set_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "absent_since"?: string | null,"art_crop_uri"?: string | null,"collector_number": string,"finishes": (Database["public"]['Enums']["card_finish"])[],"id": string,"illustration_id"?: string | null,"image_uris": (string)[],"lang": string,"oracle_id": string,"rarity": Database["public"]['Enums']["card_rarity"],"released_at": string,"set_code": string,"set_name": string
                  }
                  Update: {
                    "absent_since"?: string | null,"art_crop_uri"?: string | null,"collector_number"?: string,"finishes"?: (Database["public"]['Enums']["card_finish"])[],"id"?: string,"illustration_id"?: string | null,"image_uris"?: (string)[],"lang"?: string,"oracle_id"?: string,"rarity"?: Database["public"]['Enums']["card_rarity"],"released_at"?: string,"set_code"?: string,"set_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_printings_oracle_id_fkey"
      columns: ["oracle_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["oracle_id"]
    }
                  ]
                },"card_sets": {
                  Row: {
                    "code": string,"icon_svg_uri": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"icon_svg_uri": string,"name": string
                  }
                  Update: {
                    "code"?: string,"icon_svg_uri"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"card_taggings": {
                  Row: {
                    "oracle_id": string,"tag_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "oracle_id": string,"tag_id": string
                  }
                  Update: {
                    "oracle_id"?: string,"tag_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_taggings_oracle_id_fkey"
      columns: ["oracle_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["oracle_id"]
    },{
      foreignKeyName: "card_taggings_tag_id_fkey"
      columns: ["tag_id"]
isOneToOne: false
      referencedRelation: "oracle_tags"
      referencedColumns: ["id"]
    }
                  ]
                },"cards": {
                  Row: {
                    "absent_since": string | null,"can_be_commander": boolean,"color_bits": number | null,"color_identity": (string)[],"colors": (string)[],"commander_legality": Database["public"]['Enums']["commander_legality"],"edhrec_rank": number | null,"identity_bits": number | null,"is_game_changer": boolean | null,"keywords": (string)[],"mana_cost": string,"mana_value": number,"name": string,"name_key": string | null,"oracle_id": string,"oracle_text": string,"released_at": string,"search_vector": unknown,"type_line": string
                  }
                  ComputedFields: never
                  Insert: {
                    "absent_since"?: string | null,"can_be_commander": boolean,"color_bits"?: never,"color_identity": (string)[],"colors": (string)[],"commander_legality": Database["public"]['Enums']["commander_legality"],"edhrec_rank"?: number | null,"identity_bits"?: never,"is_game_changer"?: boolean | null,"keywords": (string)[],"mana_cost": string,"mana_value": number,"name": string,"name_key"?: never,"oracle_id": string,"oracle_text": string,"released_at": string,"search_vector"?: never,"type_line": string
                  }
                  Update: {
                    "absent_since"?: string | null,"can_be_commander"?: boolean,"color_bits"?: never,"color_identity"?: (string)[],"colors"?: (string)[],"commander_legality"?: Database["public"]['Enums']["commander_legality"],"edhrec_rank"?: number | null,"identity_bits"?: never,"is_game_changer"?: boolean | null,"keywords"?: (string)[],"mana_cost"?: string,"mana_value"?: number,"name"?: string,"name_key"?: never,"oracle_id"?: string,"oracle_text"?: string,"released_at"?: string,"search_vector"?: never,"type_line"?: string
                  }
                  Relationships: [
                    
                  ]
                },"collection_addition_copies": {
                  Row: {
                    "addition_id": string,"card_printing_id": string,"condition": Database["public"]['Enums']["card_condition"],"copy_id": string,"finish": Database["public"]['Enums']["card_finish"],"language": Database["public"]['Enums']["card_language"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "addition_id": string,"card_printing_id": string,"condition": Database["public"]['Enums']["card_condition"],"copy_id": string,"finish": Database["public"]['Enums']["card_finish"],"language": Database["public"]['Enums']["card_language"],"user_id": string
                  }
                  Update: {
                    "addition_id"?: string,"card_printing_id"?: string,"condition"?: Database["public"]['Enums']["card_condition"],"copy_id"?: string,"finish"?: Database["public"]['Enums']["card_finish"],"language"?: Database["public"]['Enums']["card_language"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "collection_addition_copies_addition_id_card_printing_id_fi_fkey"
      columns: ["addition_id","card_printing_id","finish","condition","language"]
isOneToOne: false
      referencedRelation: "collection_addition_lines"
      referencedColumns: ["addition_id","card_printing_id","finish","condition","language"]
    }
                  ]
                },"collection_addition_lines": {
                  Row: {
                    "addition_id": string,"card_printing_id": string,"condition": Database["public"]['Enums']["card_condition"],"finish": Database["public"]['Enums']["card_finish"],"language": Database["public"]['Enums']["card_language"],"price_snapshot_at": string | null,"purchase_day_usd_cents": number | null,"quantity": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "addition_id": string,"card_printing_id": string,"condition": Database["public"]['Enums']["card_condition"],"finish": Database["public"]['Enums']["card_finish"],"language": Database["public"]['Enums']["card_language"],"price_snapshot_at"?: string | null,"purchase_day_usd_cents"?: number | null,"quantity": number,"user_id": string
                  }
                  Update: {
                    "addition_id"?: string,"card_printing_id"?: string,"condition"?: Database["public"]['Enums']["card_condition"],"finish"?: Database["public"]['Enums']["card_finish"],"language"?: Database["public"]['Enums']["card_language"],"price_snapshot_at"?: string | null,"purchase_day_usd_cents"?: number | null,"quantity"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "collection_addition_lines_addition_id_fkey"
      columns: ["addition_id"]
isOneToOne: false
      referencedRelation: "collection_additions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_addition_lines_card_printing_id_fkey"
      columns: ["card_printing_id"]
isOneToOne: false
      referencedRelation: "card_printings"
      referencedColumns: ["id"]
    }
                  ]
                },"collection_additions": {
                  Row: {
                    "added_at": string,"copy_count": number,"id": string,"source": Database["public"]['Enums']["collection_addition_source"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at": string,"copy_count": number,"id"?: string,"source": Database["public"]['Enums']["collection_addition_source"],"user_id": string
                  }
                  Update: {
                    "added_at"?: string,"copy_count"?: number,"id"?: string,"source"?: Database["public"]['Enums']["collection_addition_source"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"combos": {
                  Row: {
                    "bracket_tag": Database["public"]['Enums']["combo_bracket_tag"],"color_identity": (string)[],"first_oracle_id": string,"id": string,"produced_features": (string)[],"second_oracle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bracket_tag": Database["public"]['Enums']["combo_bracket_tag"],"color_identity": (string)[],"first_oracle_id": string,"id": string,"produced_features": (string)[],"second_oracle_id": string
                  }
                  Update: {
                    "bracket_tag"?: Database["public"]['Enums']["combo_bracket_tag"],"color_identity"?: (string)[],"first_oracle_id"?: string,"id"?: string,"produced_features"?: (string)[],"second_oracle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "combos_first_oracle_id_fkey"
      columns: ["first_oracle_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["oracle_id"]
    },{
      foreignKeyName: "combos_second_oracle_id_fkey"
      columns: ["second_oracle_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["oracle_id"]
    }
                  ]
                },"copies": {
                  Row: {
                    "addition_id": string,"card_printing_id": string,"condition": Database["public"]['Enums']["card_condition"],"finish": Database["public"]['Enums']["card_finish"],"id": string,"is_protected": boolean,"language": Database["public"]['Enums']["card_language"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "addition_id": string,"card_printing_id": string,"condition": Database["public"]['Enums']["card_condition"],"finish": Database["public"]['Enums']["card_finish"],"id": string,"is_protected"?: boolean,"language": Database["public"]['Enums']["card_language"],"user_id": string
                  }
                  Update: {
                    "addition_id"?: string,"card_printing_id"?: string,"condition"?: Database["public"]['Enums']["card_condition"],"finish"?: Database["public"]['Enums']["card_finish"],"id"?: string,"is_protected"?: boolean,"language"?: Database["public"]['Enums']["card_language"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "copies_addition_id_card_printing_id_finish_condition_langu_fkey"
      columns: ["addition_id","card_printing_id","finish","condition","language"]
isOneToOne: false
      referencedRelation: "collection_addition_lines"
      referencedColumns: ["addition_id","card_printing_id","finish","condition","language"]
    },{
      foreignKeyName: "copies_user_id_id_fkey"
      columns: ["user_id","id"]
isOneToOne: false
      referencedRelation: "collection_addition_copies"
      referencedColumns: ["user_id","copy_id"]
    }
                  ]
                },"copy_user_tags": {
                  Row: {
                    "copy_id": string,"user_id": string,"user_tag_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "copy_id": string,"user_id": string,"user_tag_id": string
                  }
                  Update: {
                    "copy_id"?: string,"user_id"?: string,"user_tag_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "copy_user_tags_user_id_copy_id_fkey"
      columns: ["user_id","copy_id"]
isOneToOne: false
      referencedRelation: "copies"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "copy_user_tags_user_id_user_tag_id_fkey"
      columns: ["user_id","user_tag_id"]
isOneToOne: false
      referencedRelation: "user_tags"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"deck_basic_lands": {
                  Row: {
                    "count": number,"deck_id": string,"oracle_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count": number,"deck_id": string,"oracle_id": string,"user_id": string
                  }
                  Update: {
                    "count"?: number,"deck_id"?: string,"oracle_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deck_basic_lands_oracle_id_fkey"
      columns: ["oracle_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["oracle_id"]
    },{
      foreignKeyName: "deck_basic_lands_user_id_deck_id_fkey"
      columns: ["user_id","deck_id"]
isOneToOne: false
      referencedRelation: "decks"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"deck_cards": {
                  Row: {
                    "added_at": string,"commander_at": string | null,"copy_id": string,"deck_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"commander_at"?: string | null,"copy_id": string,"deck_id": string,"user_id": string
                  }
                  Update: {
                    "added_at"?: string,"commander_at"?: string | null,"copy_id"?: string,"deck_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deck_cards_user_id_copy_id_fkey"
      columns: ["user_id","copy_id"]
isOneToOne: true
      referencedRelation: "copies"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "deck_cards_user_id_deck_id_fkey"
      columns: ["user_id","deck_id"]
isOneToOne: false
      referencedRelation: "decks"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"deck_change_basic_lands": {
                  Row: {
                    "count_after": number,"count_before": number,"deck_change_id": string,"oracle_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count_after": number,"count_before": number,"deck_change_id": string,"oracle_id": string,"user_id": string
                  }
                  Update: {
                    "count_after"?: number,"count_before"?: number,"deck_change_id"?: string,"oracle_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deck_change_basic_lands_oracle_id_fkey"
      columns: ["oracle_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["oracle_id"]
    },{
      foreignKeyName: "deck_change_basic_lands_user_id_deck_change_id_fkey"
      columns: ["user_id","deck_change_id"]
isOneToOne: false
      referencedRelation: "deck_changes"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"deck_change_lines": {
                  Row: {
                    "card_printing_id": string,"copy_id": string,"deck_change_id": string,"finish": Database["public"]['Enums']["card_finish"],"place_after": Database["public"]['Enums']["deck_role"] | null,"place_before": Database["public"]['Enums']["deck_role"] | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "card_printing_id": string,"copy_id": string,"deck_change_id": string,"finish": Database["public"]['Enums']["card_finish"],"place_after"?: Database["public"]['Enums']["deck_role"] | null,"place_before"?: Database["public"]['Enums']["deck_role"] | null,"user_id": string
                  }
                  Update: {
                    "card_printing_id"?: string,"copy_id"?: string,"deck_change_id"?: string,"finish"?: Database["public"]['Enums']["card_finish"],"place_after"?: Database["public"]['Enums']["deck_role"] | null,"place_before"?: Database["public"]['Enums']["deck_role"] | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deck_change_lines_card_printing_id_fkey"
      columns: ["card_printing_id"]
isOneToOne: false
      referencedRelation: "card_printings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deck_change_lines_user_id_deck_change_id_fkey"
      columns: ["user_id","deck_change_id"]
isOneToOne: false
      referencedRelation: "deck_changes"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"deck_changes": {
                  Row: {
                    "changed_at": string,"deck_id": string,"id": string,"kind": Database["public"]['Enums']["deck_change_kind"],"reverted_by": string | null,"revision": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"deck_id": string,"id"?: string,"kind": Database["public"]['Enums']["deck_change_kind"],"reverted_by"?: string | null,"revision": number,"user_id": string
                  }
                  Update: {
                    "changed_at"?: string,"deck_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["deck_change_kind"],"reverted_by"?: string | null,"revision"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deck_changes_user_id_deck_id_fkey"
      columns: ["user_id","deck_id"]
isOneToOne: false
      referencedRelation: "decks"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "deck_changes_user_id_reverted_by_fkey"
      columns: ["user_id","reverted_by"]
isOneToOne: false
      referencedRelation: "deck_changes"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"decks": {
                  Row: {
                    "created_at": string,"id": string,"last_used_at": string,"name": string,"priority": Database["public"]['Enums']["deck_priority"],"revision": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_used_at"?: string,"name": string,"priority"?: Database["public"]['Enums']["deck_priority"],"revision"?: number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_used_at"?: string,"name"?: string,"priority"?: Database["public"]['Enums']["deck_priority"],"revision"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"disabled_tags": {
                  Row: {
                    "disabled_at": string,"tag_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "disabled_at"?: string,"tag_id": string
                  }
                  Update: {
                    "disabled_at"?: string,"tag_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"exchange_rates": {
                  Row: {
                    "currency": string,"rate": number,"rate_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "currency": string,"rate": number,"rate_date": string
                  }
                  Update: {
                    "currency"?: string,"rate"?: number,"rate_date"?: string
                  }
                  Relationships: [
                    
                  ]
                },"gallery_versions": {
                  Row: {
                    "manifest": NonNullable<Json>,"parity_checked_at": string | null,"parity_lowest_cosine": number | null,"parity_mean_cosine": number | null,"parity_references": number | null,"published_at": string | null,"uploaded_at": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "manifest": NonNullable<Json>,"parity_checked_at"?: string | null,"parity_lowest_cosine"?: number | null,"parity_mean_cosine"?: number | null,"parity_references"?: number | null,"published_at"?: string | null,"uploaded_at"?: string,"version": string
                  }
                  Update: {
                    "manifest"?: NonNullable<Json>,"parity_checked_at"?: string | null,"parity_lowest_cosine"?: number | null,"parity_mean_cosine"?: number | null,"parity_references"?: number | null,"published_at"?: string | null,"uploaded_at"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"import_runs": {
                  Row: {
                    "accept_shrink": boolean,"counts": Json | null,"duration": string | null,"failure_reason": string | null,"finished_at": string | null,"id": string,"merge_duration": string | null,"source": Database["public"]['Enums']["import_source"],"source_updated_at": string,"started_at": string,"status": Database["public"]['Enums']["import_run_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "accept_shrink"?: boolean,"counts"?: Json | null,"duration"?: never,"failure_reason"?: string | null,"finished_at"?: string | null,"id"?: string,"merge_duration"?: string | null,"source": Database["public"]['Enums']["import_source"],"source_updated_at": string,"started_at"?: string,"status"?: Database["public"]['Enums']["import_run_status"]
                  }
                  Update: {
                    "accept_shrink"?: boolean,"counts"?: Json | null,"duration"?: never,"failure_reason"?: string | null,"finished_at"?: string | null,"id"?: string,"merge_duration"?: string | null,"source"?: Database["public"]['Enums']["import_source"],"source_updated_at"?: string,"started_at"?: string,"status"?: Database["public"]['Enums']["import_run_status"]
                  }
                  Relationships: [
                    
                  ]
                },"import_snapshots": {
                  Row: {
                    "run_id": string,"snapshot_at": string,"source": Database["public"]['Enums']["import_source"],"succeeded_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "run_id": string,"snapshot_at": string,"source": Database["public"]['Enums']["import_source"],"succeeded_at": string
                  }
                  Update: {
                    "run_id"?: string,"snapshot_at"?: string,"source"?: Database["public"]['Enums']["import_source"],"succeeded_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_snapshots_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "import_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"oracle_tags": {
                  Row: {
                    "alias_keys": (string)[] | null,"aliases": (string)[],"description": string | null,"id": string,"label": string,"label_keys": (string)[] | null,"search_vector": unknown,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alias_keys"?: never,"aliases": (string)[],"description"?: string | null,"id": string,"label": string,"label_keys"?: never,"search_vector"?: never,"slug": string
                  }
                  Update: {
                    "alias_keys"?: never,"aliases"?: (string)[],"description"?: string | null,"id"?: string,"label"?: string,"label_keys"?: never,"search_vector"?: never,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"search_telemetry": {
                  Row: {
                    "api": Database["public"]['Enums']["search_api"],"caller": Database["public"]['Enums']["search_caller"],"created_at": string,"latency_ms": number,"query": NonNullable<Json>,"result_count": number,"result_ids": (string)[],"search_id": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "api": Database["public"]['Enums']["search_api"],"caller": Database["public"]['Enums']["search_caller"],"created_at"?: string,"latency_ms": number,"query": NonNullable<Json>,"result_count": number,"result_ids": (string)[],"search_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "api"?: Database["public"]['Enums']["search_api"],"caller"?: Database["public"]['Enums']["search_caller"],"created_at"?: string,"latency_ms"?: number,"query"?: NonNullable<Json>,"result_count"?: number,"result_ids"?: (string)[],"search_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"tag_edges": {
                  Row: {
                    "child_id": string,"parent_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"parent_id": string
                  }
                  Update: {
                    "child_id"?: string,"parent_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tag_edges_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "oracle_tags"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tag_edges_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "oracle_tags"
      referencedColumns: ["id"]
    }
                  ]
                },"user_tags": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "abort_import_run":
{ Args: { "reason": string,"run_id": string }; Returns: {
              "accept_shrink": boolean,
"counts": Json | null,
"duration": string | null,
"failure_reason": string | null,
"finished_at": string | null,
"id": string,
"merge_duration": string | null,
"source": Database["public"]['Enums']["import_source"],
"source_updated_at": string,
"started_at": string,
"status": Database["public"]['Enums']["import_run_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "import_runs"
        isOneToOne: true
        isSetofReturn: false
      } },
"add_deck_card":
{ Args: { "request": Json }; Returns: Json
                           },
"add_scan_batch":
{ Args: { "batch": Json }; Returns: Json
                           },
"begin_import_run":
{ Args: { "accept_shrink"?: boolean,"source": Database["public"]['Enums']["import_source"],"source_updated_at": string }; Returns: {
              "accept_shrink": boolean,
"counts": Json | null,
"duration": string | null,
"failure_reason": string | null,
"finished_at": string | null,
"id": string,
"merge_duration": string | null,
"source": Database["public"]['Enums']["import_source"],
"source_updated_at": string,
"started_at": string,
"status": Database["public"]['Enums']["import_run_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "import_runs"
        isOneToOne: true
        isSetofReturn: false
      } },
"catalog_freshness":
{ Args: Record<PropertyKey, never>; Returns: {
              "is_stale": boolean,"last_attempt_at": string,"last_attempt_status": Database["public"]['Enums']["import_run_status"],"snapshot_at": string,"source": Database["public"]['Enums']["import_source"],"succeeded_at": string
            }[]
                           },
"catalog_storage_sizes":
{ Args: Record<PropertyKey, never>; Returns: {
              "relation": string,"total_bytes": number
            }[]
                           },
"create_deck":
{ Args: { "request": Json }; Returns: Json
                           },
"create_user_tag":
{ Args: { "request": Json }; Returns: Json
                           },
"delete_copy":
{ Args: { "request": Json }; Returns: undefined
                           },
"delete_deck":
{ Args: { "request": Json }; Returns: undefined
                           },
"delete_gallery_version":
{ Args: { "version": string }; Returns: undefined
                           },
"delete_user_tag":
{ Args: { "request": Json }; Returns: undefined
                           },
"disable_oracle_tag":
{ Args: { "tag_id": string }; Returns: {
              "disabled": boolean,"id": string,"slug": string
            }[]
                           },
"enable_oracle_tag":
{ Args: { "tag_id": string }; Returns: {
              "disabled": boolean,"id": string,"slug": string
            }[]
                           },
"finish_import_run":
{ Args: { "run_id": string,"staged_rows": Json }; Returns: {
              "accept_shrink": boolean,
"counts": Json | null,
"duration": string | null,
"failure_reason": string | null,
"finished_at": string | null,
"id": string,
"merge_duration": string | null,
"source": Database["public"]['Enums']["import_source"],
"source_updated_at": string,
"started_at": string,
"status": Database["public"]['Enums']["import_run_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "import_runs"
        isOneToOne: true
        isSetofReturn: false
      } },
"get_cards":
{ Args: { "query": Json }; Returns: Json
                           },
"get_collection_total":
{ Args: { "query": Json }; Returns: Json
                           },
"get_copy":
{ Args: { "query": Json }; Returns: Json
                           },
"get_current_prices":
{ Args: { "query": Json }; Returns: Json
                           },
"get_deck":
{ Args: { "query": Json }; Returns: Json
                           },
"import_card_sets":
{ Args: { "sets": Json }; Returns: number
                           },
"limit_email_sign_ups":
{ Args: { "event": Json }; Returns: Json
                           },
"list_card_printings":
{ Args: { "query": Json }; Returns: Json
                           },
"list_deck_changes":
{ Args: { "query": Json }; Returns: Json
                           },
"list_decks":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_exchange_rates":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_gallery_printings":
{ Args: { "after_id"?: string }; Returns: {
              "basic_land": boolean,"id": string
            }[]
                           },
"list_user_tags":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"mark_deck_used":
{ Args: { "request": Json }; Returns: undefined
                           },
"preview_revert":
{ Args: { "query": Json }; Returns: Json
                           },
"prune_search_telemetry":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"publish_gallery_version":
{ Args: { "version": string }; Returns: string
                           },
"record_gallery_parity":
{ Args: { "lowest_cosine": number,"mean_cosine": number,"reference_count": number,"version": string }; Returns: boolean
                           },
"record_gallery_version":
{ Args: { "manifest": Json,"version": string }; Returns: undefined
                           },
"remove_deck_card":
{ Args: { "request": Json }; Returns: Json
                           },
"rename_deck":
{ Args: { "request": Json }; Returns: undefined
                           },
"rename_user_tag":
{ Args: { "request": Json }; Returns: Json
                           },
"revert_deck_changes":
{ Args: { "request": Json }; Returns: Json
                           },
"search_catalog":
{ Args: { "query": Json }; Returns: Json
                           },
"search_collection":
{ Args: { "query": Json }; Returns: Json
                           },
"search_oracle_tags":
{ Args: { "query": Json }; Returns: Json
                           },
"set_basic_lands":
{ Args: { "request": Json }; Returns: Json
                           },
"set_copy_protected":
{ Args: { "request": Json }; Returns: Json
                           },
"set_copy_user_tag":
{ Args: { "request": Json }; Returns: undefined
                           },
"set_deck_commander":
{ Args: { "request": Json }; Returns: Json
                           },
"set_deck_priority":
{ Args: { "request": Json }; Returns: undefined
                           },
"stage_import_batch":
{ Args: { "batch_number": number,"batch_rows": Json,"run_id": string,"target": string }; Returns: number
                           }
          }
          Enums: {
            "card_condition": "near_mint"|"lightly_played"|"moderately_played"|"heavily_played"|"damaged","card_finish": "nonfoil"|"foil"|"etched","card_language": "en"|"ja"|"de"|"fr"|"it"|"es"|"pt"|"ko"|"ru"|"zhs"|"zht","card_rarity": "common"|"uncommon"|"rare"|"mythic"|"special"|"bonus","collection_addition_source": "scan_batch","combo_bracket_tag": "ruthless"|"spicy"|"powerful"|"oddball"|"core"|"exhibition"|"banned","commander_legality": "legal"|"banned"|"not_legal"|"unknown","deck_change_kind": "added"|"removed"|"made_commander"|"made_partner"|"moved_to_main_deck"|"basic_lands"|"removed_from_collection"|"revert","deck_priority": "high"|"medium"|"low","deck_role": "commander"|"main","import_run_status": "running"|"succeeded"|"failed"|"skipped"|"expired","import_source": "catalog"|"oracle_tags"|"commander_spellbook"|"prices"|"exchange_rates","search_api": "catalog"|"collection","search_caller": "app"|"mcp"|"release_check"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "card_condition": ["near_mint", "lightly_played", "moderately_played", "heavily_played", "damaged"],"card_finish": ["nonfoil", "foil", "etched"],"card_language": ["en", "ja", "de", "fr", "it", "es", "pt", "ko", "ru", "zhs", "zht"],"card_rarity": ["common", "uncommon", "rare", "mythic", "special", "bonus"],"collection_addition_source": ["scan_batch"],"combo_bracket_tag": ["ruthless", "spicy", "powerful", "oddball", "core", "exhibition", "banned"],"commander_legality": ["legal", "banned", "not_legal", "unknown"],"deck_change_kind": ["added", "removed", "made_commander", "made_partner", "moved_to_main_deck", "basic_lands", "removed_from_collection", "revert"],"deck_priority": ["high", "medium", "low"],"deck_role": ["commander", "main"],"import_run_status": ["running", "succeeded", "failed", "skipped", "expired"],"import_source": ["catalog", "oracle_tags", "commander_spellbook", "prices", "exchange_rates"],"search_api": ["catalog", "collection"],"search_caller": ["app", "mcp", "release_check"]
          }
        }
} as const
