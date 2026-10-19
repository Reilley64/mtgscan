
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
            "ai_write_requests": {
                  Row: {
                    "created_at": string,"idempotency_key": string,"request": NonNullable<Json>,"result": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"idempotency_key": string,"request": NonNullable<Json>,"result": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"idempotency_key"?: string,"request"?: NonNullable<Json>,"result"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"buylist_cards": {
                  Row: {
                    "as_commander": boolean,"close_note": Database["public"]['Enums']["close_note"] | null,"created_at": string,"created_by": string,"deck_id": string,"id": string,"incoming_oracle_id": string,"outgoing_copy_id": string | null,"outgoing_oracle_id": string | null,"reason": string,"status": Database["public"]['Enums']["buylist_card_status"],"status_changed_at": string,"updated_at": string,"updated_by": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "as_commander": boolean,"close_note"?: Database["public"]['Enums']["close_note"] | null,"created_at"?: string,"created_by"?: string,"deck_id": string,"id"?: string,"incoming_oracle_id": string,"outgoing_copy_id"?: string | null,"outgoing_oracle_id"?: string | null,"reason": string,"status"?: Database["public"]['Enums']["buylist_card_status"],"status_changed_at"?: string,"updated_at"?: string,"updated_by"?: string,"user_id": string
                  }
                  Update: {
                    "as_commander"?: boolean,"close_note"?: Database["public"]['Enums']["close_note"] | null,"created_at"?: string,"created_by"?: string,"deck_id"?: string,"id"?: string,"incoming_oracle_id"?: string,"outgoing_copy_id"?: string | null,"outgoing_oracle_id"?: string | null,"reason"?: string,"status"?: Database["public"]['Enums']["buylist_card_status"],"status_changed_at"?: string,"updated_at"?: string,"updated_by"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "buylist_cards_incoming_oracle_id_fkey"
      columns: ["incoming_oracle_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["oracle_id"]
    },{
      foreignKeyName: "buylist_cards_outgoing_oracle_id_fkey"
      columns: ["outgoing_oracle_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["oracle_id"]
    },{
      foreignKeyName: "buylist_cards_user_id_deck_id_fkey"
      columns: ["user_id","deck_id"]
isOneToOne: false
      referencedRelation: "decks"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"card_faces": {
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
                    "absent_since": string | null,"art_crop_uri": string | null,"booster": boolean,"collector_number": string,"finishes": (Database["public"]['Enums']["card_finish"])[],"id": string,"illustration_id": string | null,"image_uris": (string)[],"lang": string,"oracle_id": string,"promo": boolean,"rarity": Database["public"]['Enums']["card_rarity"],"released_at": string,"set_code": string,"set_name": string,"variation": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "absent_since"?: string | null,"art_crop_uri"?: string | null,"booster": boolean,"collector_number": string,"finishes": (Database["public"]['Enums']["card_finish"])[],"id": string,"illustration_id"?: string | null,"image_uris": (string)[],"lang": string,"oracle_id": string,"promo": boolean,"rarity": Database["public"]['Enums']["card_rarity"],"released_at": string,"set_code": string,"set_name": string,"variation": boolean
                  }
                  Update: {
                    "absent_since"?: string | null,"art_crop_uri"?: string | null,"booster"?: boolean,"collector_number"?: string,"finishes"?: (Database["public"]['Enums']["card_finish"])[],"id"?: string,"illustration_id"?: string | null,"image_uris"?: (string)[],"lang"?: string,"oracle_id"?: string,"promo"?: boolean,"rarity"?: Database["public"]['Enums']["card_rarity"],"released_at"?: string,"set_code"?: string,"set_name"?: string,"variation"?: boolean
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
                    "code": string,"icon_svg_uri": string,"name": string,"released_at": string | null,"set_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"icon_svg_uri": string,"name": string,"released_at"?: string | null,"set_type"?: string | null
                  }
                  Update: {
                    "code"?: string,"icon_svg_uri"?: string,"name"?: string,"released_at"?: string | null,"set_type"?: string | null
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
                    "absent_since": string | null,"can_be_commander": boolean,"color_bits": number | null,"color_identity": (string)[],"colors": (string)[],"commander_chooses_a_color": boolean | null,"commander_legality": Database["public"]['Enums']["commander_legality"],"copy_limit": Database["public"]['Enums']["copy_limit"],"copy_limit_number": number | null,"edhrec_rank": number | null,"has_choose_a_background": boolean | null,"has_doctors_companion": boolean | null,"has_partner": boolean | null,"identity_bits": number | null,"is_game_changer": boolean | null,"keywords": (string)[],"mana_cost": string,"mana_value": number,"name": string,"name_key": string | null,"oracle_id": string,"oracle_text": string,"partner_text": string | null,"partner_with_name": string | null,"released_at": string,"search_vector": unknown,"type_line": string
                  }
                  ComputedFields: never
                  Insert: {
                    "absent_since"?: string | null,"can_be_commander": boolean,"color_bits"?: never,"color_identity": (string)[],"colors": (string)[],"commander_chooses_a_color"?: boolean | null,"commander_legality": Database["public"]['Enums']["commander_legality"],"copy_limit": Database["public"]['Enums']["copy_limit"],"copy_limit_number"?: number | null,"edhrec_rank"?: number | null,"has_choose_a_background"?: boolean | null,"has_doctors_companion"?: boolean | null,"has_partner"?: boolean | null,"identity_bits"?: never,"is_game_changer"?: boolean | null,"keywords": (string)[],"mana_cost": string,"mana_value": number,"name": string,"name_key"?: never,"oracle_id": string,"oracle_text": string,"partner_text"?: string | null,"partner_with_name"?: string | null,"released_at": string,"search_vector"?: never,"type_line": string
                  }
                  Update: {
                    "absent_since"?: string | null,"can_be_commander"?: boolean,"color_bits"?: never,"color_identity"?: (string)[],"colors"?: (string)[],"commander_chooses_a_color"?: boolean | null,"commander_legality"?: Database["public"]['Enums']["commander_legality"],"copy_limit"?: Database["public"]['Enums']["copy_limit"],"copy_limit_number"?: number | null,"edhrec_rank"?: number | null,"has_choose_a_background"?: boolean | null,"has_doctors_companion"?: boolean | null,"has_partner"?: boolean | null,"identity_bits"?: never,"is_game_changer"?: boolean | null,"keywords"?: (string)[],"mana_cost"?: string,"mana_value"?: number,"name"?: string,"name_key"?: never,"oracle_id"?: string,"oracle_text"?: string,"partner_text"?: string | null,"partner_with_name"?: string | null,"released_at"?: string,"search_vector"?: never,"type_line"?: string
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
                    "added_at": string,"copy_count": number,"created_at": string,"created_by": string,"id": string,"source": Database["public"]['Enums']["collection_addition_source"],"updated_at": string,"updated_by": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at": string,"copy_count": number,"created_at"?: string,"created_by"?: string,"id"?: string,"source": Database["public"]['Enums']["collection_addition_source"],"updated_at"?: string,"updated_by"?: string,"user_id": string
                  }
                  Update: {
                    "added_at"?: string,"copy_count"?: number,"created_at"?: string,"created_by"?: string,"id"?: string,"source"?: Database["public"]['Enums']["collection_addition_source"],"updated_at"?: string,"updated_by"?: string,"user_id"?: string
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
                    "addition_id": string,"card_printing_id": string,"condition": Database["public"]['Enums']["card_condition"],"created_at": string,"created_by": string,"finish": Database["public"]['Enums']["card_finish"],"id": string,"is_protected": boolean,"language": Database["public"]['Enums']["card_language"],"updated_at": string,"updated_by": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "addition_id": string,"card_printing_id": string,"condition": Database["public"]['Enums']["card_condition"],"created_at"?: string,"created_by"?: string,"finish": Database["public"]['Enums']["card_finish"],"id": string,"is_protected"?: boolean,"language": Database["public"]['Enums']["card_language"],"updated_at"?: string,"updated_by"?: string,"user_id": string
                  }
                  Update: {
                    "addition_id"?: string,"card_printing_id"?: string,"condition"?: Database["public"]['Enums']["card_condition"],"created_at"?: string,"created_by"?: string,"finish"?: Database["public"]['Enums']["card_finish"],"id"?: string,"is_protected"?: boolean,"language"?: Database["public"]['Enums']["card_language"],"updated_at"?: string,"updated_by"?: string,"user_id"?: string
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
                    "copy_id": string,"created_at": string,"created_by": string,"deleted_at": string | null,"updated_at": string,"updated_by": string,"user_id": string,"user_tag_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "copy_id": string,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"updated_at"?: string,"updated_by"?: string,"user_id": string,"user_tag_id": string
                  }
                  Update: {
                    "copy_id"?: string,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"updated_at"?: string,"updated_by"?: string,"user_id"?: string,"user_tag_id"?: string
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
                    "count": number,"created_at": string,"created_by": string,"deck_id": string,"oracle_id": string,"updated_at": string,"updated_by": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count": number,"created_at"?: string,"created_by"?: string,"deck_id": string,"oracle_id": string,"updated_at"?: string,"updated_by"?: string,"user_id": string
                  }
                  Update: {
                    "count"?: number,"created_at"?: string,"created_by"?: string,"deck_id"?: string,"oracle_id"?: string,"updated_at"?: string,"updated_by"?: string,"user_id"?: string
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
                    "added_at": string,"commander_at": string | null,"copy_id": string,"created_at": string,"created_by": string,"deck_id": string,"updated_at": string,"updated_by": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"commander_at"?: string | null,"copy_id": string,"created_at"?: string,"created_by"?: string,"deck_id": string,"updated_at"?: string,"updated_by"?: string,"user_id": string
                  }
                  Update: {
                    "added_at"?: string,"commander_at"?: string | null,"copy_id"?: string,"created_at"?: string,"created_by"?: string,"deck_id"?: string,"updated_at"?: string,"updated_by"?: string,"user_id"?: string
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
                    "changed_at": string,"created_at": string,"created_by": string,"deck_id": string,"id": string,"kind": Database["public"]['Enums']["deck_change_kind"],"reason": string | null,"reverted_by": string | null,"revision": number,"updated_at": string,"updated_by": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"created_at"?: string,"created_by"?: string,"deck_id": string,"id"?: string,"kind": Database["public"]['Enums']["deck_change_kind"],"reason"?: string | null,"reverted_by"?: string | null,"revision": number,"updated_at"?: string,"updated_by"?: string,"user_id": string
                  }
                  Update: {
                    "changed_at"?: string,"created_at"?: string,"created_by"?: string,"deck_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["deck_change_kind"],"reason"?: string | null,"reverted_by"?: string | null,"revision"?: number,"updated_at"?: string,"updated_by"?: string,"user_id"?: string
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
                },"deck_evaluations": {
                  Row: {
                    "bracket_signals": NonNullable<Json>,"catalog_at": string | null,"chosen_color": string | null,"commander_spellbook_at": string | null,"deck_id": string,"estimated_bracket": number,"judged_at": string,"missing_signal_count": number,"oracle_tags_at": string | null,"revision": number,"undetermined": NonNullable<Json>,"user_id": string,"validity": Database["public"]['Enums']["deck_validity"],"violations": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "bracket_signals": NonNullable<Json>,"catalog_at"?: string | null,"chosen_color"?: string | null,"commander_spellbook_at"?: string | null,"deck_id": string,"estimated_bracket": number,"judged_at"?: string,"missing_signal_count": number,"oracle_tags_at"?: string | null,"revision": number,"undetermined": NonNullable<Json>,"user_id": string,"validity": Database["public"]['Enums']["deck_validity"],"violations": NonNullable<Json>
                  }
                  Update: {
                    "bracket_signals"?: NonNullable<Json>,"catalog_at"?: string | null,"chosen_color"?: string | null,"commander_spellbook_at"?: string | null,"deck_id"?: string,"estimated_bracket"?: number,"judged_at"?: string,"missing_signal_count"?: number,"oracle_tags_at"?: string | null,"revision"?: number,"undetermined"?: NonNullable<Json>,"user_id"?: string,"validity"?: Database["public"]['Enums']["deck_validity"],"violations"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "deck_evaluations_user_id_deck_id_fkey"
      columns: ["user_id","deck_id"]
isOneToOne: true
      referencedRelation: "decks"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"decks": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"last_used_at": string,"name": string,"priority": Database["public"]['Enums']["deck_priority"],"revision": number,"updated_at": string,"updated_by": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"last_used_at"?: string,"name": string,"priority"?: Database["public"]['Enums']["deck_priority"],"revision"?: number,"updated_at"?: string,"updated_by"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"last_used_at"?: string,"name"?: string,"priority"?: Database["public"]['Enums']["deck_priority"],"revision"?: number,"updated_at"?: string,"updated_by"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"disabled_tag_changes": {
                  Row: {
                    "changed_at": string,"tag_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"tag_id": string
                  }
                  Update: {
                    "changed_at"?: string,"tag_id"?: string
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
                },"mcp_call_counts": {
                  Row: {
                    "count": number,"period": string,"period_start": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count": number,"period": string,"period_start": string,"user_id": string
                  }
                  Update: {
                    "count"?: number,"period"?: string,"period_start"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
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
                },"planned_swaps": {
                  Row: {
                    "as_commander": boolean,"close_note": Database["public"]['Enums']["close_note"] | null,"created_at": string,"created_by": string,"deck_id": string,"id": string,"incoming_copy_id": string | null,"incoming_oracle_id": string,"outgoing_copy_id": string | null,"outgoing_oracle_id": string | null,"reason": string,"status": Database["public"]['Enums']["planned_swap_status"],"status_changed_at": string,"updated_at": string,"updated_by": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "as_commander": boolean,"close_note"?: Database["public"]['Enums']["close_note"] | null,"created_at"?: string,"created_by"?: string,"deck_id": string,"id"?: string,"incoming_copy_id"?: string | null,"incoming_oracle_id": string,"outgoing_copy_id"?: string | null,"outgoing_oracle_id"?: string | null,"reason": string,"status"?: Database["public"]['Enums']["planned_swap_status"],"status_changed_at"?: string,"updated_at"?: string,"updated_by"?: string,"user_id": string
                  }
                  Update: {
                    "as_commander"?: boolean,"close_note"?: Database["public"]['Enums']["close_note"] | null,"created_at"?: string,"created_by"?: string,"deck_id"?: string,"id"?: string,"incoming_copy_id"?: string | null,"incoming_oracle_id"?: string,"outgoing_copy_id"?: string | null,"outgoing_oracle_id"?: string | null,"reason"?: string,"status"?: Database["public"]['Enums']["planned_swap_status"],"status_changed_at"?: string,"updated_at"?: string,"updated_by"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "planned_swaps_incoming_oracle_id_fkey"
      columns: ["incoming_oracle_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["oracle_id"]
    },{
      foreignKeyName: "planned_swaps_outgoing_oracle_id_fkey"
      columns: ["outgoing_oracle_id"]
isOneToOne: false
      referencedRelation: "cards"
      referencedColumns: ["oracle_id"]
    },{
      foreignKeyName: "planned_swaps_user_id_deck_id_fkey"
      columns: ["user_id","deck_id"]
isOneToOne: false
      referencedRelation: "decks"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"created_by": string,"training_crop_uploads": boolean,"updated_at": string,"updated_by": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"training_crop_uploads"?: boolean,"updated_at"?: string,"updated_by"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"training_crop_uploads"?: boolean,"updated_at"?: string,"updated_by"?: string,"user_id"?: string
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
                },"training_crops": {
                  Row: {
                    "accepted": boolean,"art_margin": number | null,"crop_id": string,"decision_basis": Database["public"]['Enums']["decision_basis"] | null,"decision_reasons": (string)[],"feature_print_revision": number,"gallery_version": string,"policy_version": number,"printing_change": Database["public"]['Enums']["printing_change"] | null,"printing_confirmed": boolean,"reading_collector_number": string | null,"reading_names_saved_printing": boolean,"reading_premium_mark": boolean,"reading_set_code": string | null,"recognized_printing_id": string,"recognizer_version": string,"same_text_twin_count": number,"saved_printing_id": string,"top_similarity": number
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted": boolean,"art_margin"?: number | null,"crop_id": string,"decision_basis"?: Database["public"]['Enums']["decision_basis"] | null,"decision_reasons": (string)[],"feature_print_revision": number,"gallery_version": string,"policy_version": number,"printing_change"?: Database["public"]['Enums']["printing_change"] | null,"printing_confirmed": boolean,"reading_collector_number"?: string | null,"reading_names_saved_printing": boolean,"reading_premium_mark": boolean,"reading_set_code"?: string | null,"recognized_printing_id": string,"recognizer_version": string,"same_text_twin_count": number,"saved_printing_id": string,"top_similarity": number
                  }
                  Update: {
                    "accepted"?: boolean,"art_margin"?: number | null,"crop_id"?: string,"decision_basis"?: Database["public"]['Enums']["decision_basis"] | null,"decision_reasons"?: (string)[],"feature_print_revision"?: number,"gallery_version"?: string,"policy_version"?: number,"printing_change"?: Database["public"]['Enums']["printing_change"] | null,"printing_confirmed"?: boolean,"reading_collector_number"?: string | null,"reading_names_saved_printing"?: boolean,"reading_premium_mark"?: boolean,"reading_set_code"?: string | null,"recognized_printing_id"?: string,"recognizer_version"?: string,"same_text_twin_count"?: number,"saved_printing_id"?: string,"top_similarity"?: number
                  }
                  Relationships: [
                    
                  ]
                },"user_tags": {
                  Row: {
                    "created_at": string,"created_by": string,"deleted_at": string | null,"id": string,"name": string,"updated_at": string,"updated_by": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"id"?: string,"name": string,"updated_at"?: string,"updated_by"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string,"updated_by"?: string,"user_id"?: string
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
"add_training_crop":
{ Args: { "request": Json }; Returns: undefined
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
"begin_mcp_call":
{ Args: { "tool": string }; Returns: undefined
                           },
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
"change_basic_land":
{ Args: { "request": Json }; Returns: Json
                           },
"close_buylist_card":
{ Args: { "request": Json }; Returns: Json
                           },
"close_planned_swap":
{ Args: { "request": Json }; Returns: Json
                           },
"create_buylist_cards":
{ Args: { "request": Json }; Returns: Json
                           },
"create_deck":
{ Args: { "request": Json }; Returns: Json
                           },
"create_planned_swaps":
{ Args: { "request": Json }; Returns: Json
                           },
"create_user_tag":
{ Args: { "request": Json }; Returns: Json
                           },
"deck_evaluations_are_behind":
{ Args: Record<PropertyKey, never>; Returns: boolean
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
"get_needs_you_counts":
{ Args: { "query"?: Json }; Returns: Json
                           },
"get_set":
{ Args: { "query": Json }; Returns: Json
                           },
"get_training_crop_settings":
{ Args: { "query"?: Json }; Returns: Json
                           },
"import_card_sets":
{ Args: { "sets": Json }; Returns: number
                           },
"limit_email_sign_ups":
{ Args: { "event": Json }; Returns: Json
                           },
"list_basic_land_cards":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_buylist":
{ Args: { "query"?: Json }; Returns: Json
                           },
"list_card_printings":
{ Args: { "query": Json }; Returns: Json
                           },
"list_deck_changes":
{ Args: { "query": Json }; Returns: Json
                           },
"list_decks":
{ Args: { "query"?: Json }; Returns: Json
                           },
"list_exchange_rates":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_free_copies":
{ Args: { "query": Json }; Returns: Json
                           },
"list_gallery_printings":
{ Args: { "after_id"?: string }; Returns: {
              "basic_land": boolean,"id": string
            }[]
                           },
"list_planned_swaps":
{ Args: { "query"?: Json }; Returns: Json
                           },
"list_sets":
{ Args: { "query": Json }; Returns: Json
                           },
"list_user_tags":
{ Args: { "query"?: Json }; Returns: Json
                           },
"mark_buylist_card_bought":
{ Args: { "request": Json }; Returns: Json
                           },
"mark_deck_used":
{ Args: { "request": Json }; Returns: undefined
                           },
"mcp_close_buylist_card":
{ Args: { "request": Json }; Returns: Json
                           },
"mcp_close_planned_swap":
{ Args: { "request": Json }; Returns: Json
                           },
"mcp_create_user_tag":
{ Args: { "request": Json }; Returns: Json
                           },
"mcp_delete_user_tag":
{ Args: { "request": Json }; Returns: Json
                           },
"mcp_rename_user_tag":
{ Args: { "request": Json }; Returns: Json
                           },
"mcp_restore_user_tag":
{ Args: { "request": Json }; Returns: Json
                           },
"mcp_set_copies_user_tag":
{ Args: { "request": Json }; Returns: Json
                           },
"preview_add_deck_card":
{ Args: { "query": Json }; Returns: Json
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
"recompute_deck_evaluations":
{ Args: Record<PropertyKey, never>; Returns: number
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
"set_mcp_audience":
{ Args: { "event": Json }; Returns: Json
                           },
"set_training_crop_uploads":
{ Args: { "request": Json }; Returns: Json
                           },
"stage_import_batch":
{ Args: { "batch_number": number,"batch_rows": Json,"run_id": string,"target": string }; Returns: number
                           },
"swap_in_planned_swap":
{ Args: { "request": Json }; Returns: Json
                           },
"swap_in_planned_swaps":
{ Args: { "request": Json }; Returns: Json
                           }
          }
          Enums: {
            "buylist_card_status": "open"|"bought"|"closed","card_condition": "near_mint"|"lightly_played"|"moderately_played"|"heavily_played"|"damaged","card_finish": "nonfoil"|"foil"|"etched","card_language": "en"|"ja"|"de"|"fr"|"it"|"es"|"pt"|"ko"|"ru"|"zhs"|"zht","card_rarity": "common"|"uncommon"|"rare"|"mythic"|"special"|"bonus","close_note": "closed_by_user"|"closed_by_ai_client"|"outgoing_left_deck"|"held_copy_deleted"|"held_copy_reverted","collection_addition_source": "scan_batch","combo_bracket_tag": "ruthless"|"spicy"|"powerful"|"oddball"|"core"|"exhibition"|"banned","commander_legality": "legal"|"banned"|"not_legal"|"unknown","copy_limit": "one"|"any_number"|"number"|"unknown","decision_basis": "collector_line"|"set_code"|"unique_art","deck_change_kind": "added"|"removed"|"made_commander"|"made_partner"|"moved_to_main_deck"|"basic_lands"|"removed_from_collection"|"revert"|"swapped_in"|"bought","deck_priority": "high"|"medium"|"low","deck_role": "commander"|"main","deck_validity": "valid"|"invalid"|"cannot_be_determined","import_run_status": "running"|"succeeded"|"failed"|"skipped"|"expired","import_source": "catalog"|"oracle_tags"|"commander_spellbook"|"prices"|"exchange_rates","planned_swap_status": "open"|"swapped_in"|"closed"|"moved_to_buylist","printing_change": "other_options"|"printings_picker"|"name_search","search_api": "catalog"|"collection","search_caller": "app"|"mcp"|"release_check"
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
            "buylist_card_status": ["open", "bought", "closed"],"card_condition": ["near_mint", "lightly_played", "moderately_played", "heavily_played", "damaged"],"card_finish": ["nonfoil", "foil", "etched"],"card_language": ["en", "ja", "de", "fr", "it", "es", "pt", "ko", "ru", "zhs", "zht"],"card_rarity": ["common", "uncommon", "rare", "mythic", "special", "bonus"],"close_note": ["closed_by_user", "closed_by_ai_client", "outgoing_left_deck", "held_copy_deleted", "held_copy_reverted"],"collection_addition_source": ["scan_batch"],"combo_bracket_tag": ["ruthless", "spicy", "powerful", "oddball", "core", "exhibition", "banned"],"commander_legality": ["legal", "banned", "not_legal", "unknown"],"copy_limit": ["one", "any_number", "number", "unknown"],"decision_basis": ["collector_line", "set_code", "unique_art"],"deck_change_kind": ["added", "removed", "made_commander", "made_partner", "moved_to_main_deck", "basic_lands", "removed_from_collection", "revert", "swapped_in", "bought"],"deck_priority": ["high", "medium", "low"],"deck_role": ["commander", "main"],"deck_validity": ["valid", "invalid", "cannot_be_determined"],"import_run_status": ["running", "succeeded", "failed", "skipped", "expired"],"import_source": ["catalog", "oracle_tags", "commander_spellbook", "prices", "exchange_rates"],"planned_swap_status": ["open", "swapped_in", "closed", "moved_to_buylist"],"printing_change": ["other_options", "printings_picker", "name_search"],"search_api": ["catalog", "collection"],"search_caller": ["app", "mcp", "release_check"]
          }
        }
} as const
