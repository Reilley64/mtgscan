
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
                },"card_printings": {
                  Row: {
                    "absent_since": string | null,"collector_number": string,"finishes": (Database["public"]['Enums']["card_finish"])[],"id": string,"illustration_id": string | null,"image_uris": (string)[],"lang": string,"oracle_id": string,"rarity": Database["public"]['Enums']["card_rarity"],"released_at": string,"set_code": string,"set_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "absent_since"?: string | null,"collector_number": string,"finishes": (Database["public"]['Enums']["card_finish"])[],"id": string,"illustration_id"?: string | null,"image_uris": (string)[],"lang": string,"oracle_id": string,"rarity": Database["public"]['Enums']["card_rarity"],"released_at": string,"set_code": string,"set_name": string
                  }
                  Update: {
                    "absent_since"?: string | null,"collector_number"?: string,"finishes"?: (Database["public"]['Enums']["card_finish"])[],"id"?: string,"illustration_id"?: string | null,"image_uris"?: (string)[],"lang"?: string,"oracle_id"?: string,"rarity"?: Database["public"]['Enums']["card_rarity"],"released_at"?: string,"set_code"?: string,"set_name"?: string
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
                    "api": Database["public"]['Enums']["search_api"],"caller": Database["public"]['Enums']["search_caller"],"created_at": string,"latency_ms": number,"query": NonNullable<Json>,"result_count": number,"result_ids": (string)[],"search_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "api": Database["public"]['Enums']["search_api"],"caller": Database["public"]['Enums']["search_caller"],"created_at"?: string,"latency_ms": number,"query": NonNullable<Json>,"result_count": number,"result_ids": (string)[],"search_id": string,"user_id": string
                  }
                  Update: {
                    "api"?: Database["public"]['Enums']["search_api"],"caller"?: Database["public"]['Enums']["search_caller"],"created_at"?: string,"latency_ms"?: number,"query"?: NonNullable<Json>,"result_count"?: number,"result_ids"?: (string)[],"search_id"?: string,"user_id"?: string
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
"search_catalog":
{ Args: { "query": Json }; Returns: Json
                           },
"stage_import_batch":
{ Args: { "batch_number": number,"batch_rows": Json,"run_id": string,"target": string }; Returns: number
                           }
          }
          Enums: {
            "card_finish": "nonfoil"|"foil"|"etched","card_rarity": "common"|"uncommon"|"rare"|"mythic"|"special"|"bonus","commander_legality": "legal"|"banned"|"not_legal"|"unknown","import_run_status": "running"|"succeeded"|"failed"|"skipped"|"expired","import_source": "catalog"|"oracle_tags"|"commander_spellbook"|"prices","search_api": "catalog"|"collection","search_caller": "app"|"mcp"|"release_check"
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
            "card_finish": ["nonfoil", "foil", "etched"],"card_rarity": ["common", "uncommon", "rare", "mythic", "special", "bonus"],"commander_legality": ["legal", "banned", "not_legal", "unknown"],"import_run_status": ["running", "succeeded", "failed", "skipped", "expired"],"import_source": ["catalog", "oracle_tags", "commander_spellbook", "prices"],"search_api": ["catalog", "collection"],"search_caller": ["app", "mcp", "release_check"]
          }
        }
} as const
