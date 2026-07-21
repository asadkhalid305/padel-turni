export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_users: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          role: "member" | "admin" | "super_admin";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string;
          role?: "member" | "admin" | "super_admin";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string;
          role?: "member" | "admin" | "super_admin";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_corrections_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_corrections_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_corrections_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_corrections_corrected_by_app_user_id_fkey";
            columns: ["corrected_by_app_user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          id: string;
          name: string;
          personal_owner_app_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          personal_owner_app_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["workspaces"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "workspaces_personal_owner_app_user_id_fkey";
            columns: ["personal_owner_app_user_id"];
            isOneToOne: true;
            referencedRelation: "app_users";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_memberships: {
        Row: {
          id: string;
          workspace_id: string;
          app_user_id: string;
          role: "owner" | "admin" | "member";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          app_user_id: string;
          role?: "owner" | "admin" | "member";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["workspace_memberships"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "workspace_memberships_app_user_id_fkey";
            columns: ["app_user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_memberships_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_invites: {
        Row: {
          id: string;
          workspace_id: string;
          token_hash: string;
          invited_email: string | null;
          status: "pending" | "accepted" | "revoked" | "expired";
          created_by_app_user_id: string;
          accepted_by_app_user_id: string | null;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          token_hash: string;
          invited_email?: string | null;
          status?: "pending" | "accepted" | "revoked" | "expired";
          created_by_app_user_id: string;
          accepted_by_app_user_id?: string | null;
          expires_at: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["workspace_invites"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "workspace_invites_accepted_by_app_user_id_fkey";
            columns: ["accepted_by_app_user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_invites_created_by_app_user_id_fkey";
            columns: ["created_by_app_user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      app_events: {
        Row: {
          id: string;
          workspace_id: string | null;
          app_user_id: string | null;
          event_type: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id?: string | null;
          app_user_id?: string | null;
          event_type: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["app_events"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "app_events_app_user_id_fkey";
            columns: ["app_user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "app_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback_messages: {
        Row: {
          id: string;
          workspace_id: string | null;
          app_user_id: string | null;
          email: string | null;
          category: "general" | "bug" | "onboarding" | "invite" | "event";
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id?: string | null;
          app_user_id?: string | null;
          email?: string | null;
          category?: "general" | "bug" | "onboarding" | "invite" | "event";
          message: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["feedback_messages"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "feedback_messages_app_user_id_fkey";
            columns: ["app_user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "feedback_messages_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      event_email_deliveries: {
        Row: {
          id: string;
          workspace_id: string;
          event_id: string;
          event_player_id: string;
          recipient_app_user_id: string | null;
          recipient_email: string;
          recipient_name: string;
          kind: "final_standings";
          status: "pending" | "sent" | "failed";
          provider: string | null;
          provider_message_id: string | null;
          payload_snapshot: Json;
          error_message: string | null;
          last_attempt_at: string | null;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          event_id: string;
          event_player_id: string;
          recipient_app_user_id?: string | null;
          recipient_email: string;
          recipient_name?: string;
          kind?: "final_standings";
          status?: "pending" | "sent" | "failed";
          provider?: string | null;
          provider_message_id?: string | null;
          payload_snapshot?: Json;
          error_message?: string | null;
          last_attempt_at?: string | null;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["event_email_deliveries"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "event_email_deliveries_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_email_deliveries_event_player_id_fkey";
            columns: ["event_player_id"];
            isOneToOne: false;
            referencedRelation: "event_players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_email_deliveries_recipient_app_user_id_fkey";
            columns: ["recipient_app_user_id"];
            isOneToOne: false;
            referencedRelation: "app_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_email_deliveries_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      players: {
        Row: {
          id: string;
          workspace_id: string | null;
          name: string;
          account_email: string | null;
          app_user_id: string | null;
          rating: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id?: string | null;
          name: string;
          account_email?: string | null;
          app_user_id?: string | null;
          rating?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string | null;
          name?: string;
          account_email?: string | null;
          app_user_id?: string | null;
          rating?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "players_app_user_id_fkey";
            columns: ["app_user_id"];
            isOneToOne: true;
            referencedRelation: "app_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "players_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          archived_at: string | null;
          id: string;
          workspace_id: string | null;
          name: string;
          venue: string;
          starts_at: string;
          status: string;
          standings_eligible: boolean;
          seed: number;
          draw_strategy: "random" | "rating_balanced";
          round_minutes: number;
          break_minutes: number;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          id?: string;
          workspace_id?: string | null;
          name: string;
          venue?: string;
          starts_at: string;
          status?: string;
          standings_eligible?: boolean;
          seed?: number;
          draw_strategy?: "random" | "rating_balanced";
          round_minutes?: number;
          break_minutes?: number;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      event_players: {
        Row: {
          id: string;
          event_id: string;
          player_id: string;
          name_snapshot: string;
          rating_snapshot: number;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          player_id: string;
          name_snapshot: string;
          rating_snapshot: number;
          display_order: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          player_id?: string;
          name_snapshot?: string;
          rating_snapshot?: number;
          display_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_players_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_players_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      event_rounds: {
        Row: {
          id: string;
          event_id: string;
          round_number: number;
          court_count: number;
          starts_at: string | null;
          duration_seconds: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          round_number: number;
          court_count: number;
          starts_at?: string | null;
          duration_seconds: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["event_rounds"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "event_rounds_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      matches: {
        Row: {
          id: string;
          event_id: string;
          round_id: string;
          court_number: number;
          status: string;
          team_one_player_one_id: string;
          team_one_player_two_id: string;
          team_two_player_one_id: string;
          team_two_player_two_id: string;
          team_one_score: number | null;
          team_two_score: number | null;
          timer_started_at: string | null;
          timer_paused_at: string | null;
          timer_accumulated_pause_seconds: number;
          timer_duration_seconds: number;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          round_id: string;
          court_number: number;
          status?: string;
          team_one_player_one_id: string;
          team_one_player_two_id: string;
          team_two_player_one_id: string;
          team_two_player_two_id: string;
          team_one_score?: number | null;
          team_two_score?: number | null;
          timer_started_at?: string | null;
          timer_paused_at?: string | null;
          timer_accumulated_pause_seconds?: number;
          timer_duration_seconds: number;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["matches"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "matches_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_event_id_round_id_fkey";
            columns: ["event_id", "round_id"];
            isOneToOne: false;
            referencedRelation: "event_rounds";
            referencedColumns: ["event_id", "id"];
          },
          {
            foreignKeyName: "matches_event_id_team_one_player_one_id_fkey";
            columns: ["event_id", "team_one_player_one_id"];
            isOneToOne: false;
            referencedRelation: "event_players";
            referencedColumns: ["event_id", "id"];
          },
          {
            foreignKeyName: "matches_event_id_team_one_player_two_id_fkey";
            columns: ["event_id", "team_one_player_two_id"];
            isOneToOne: false;
            referencedRelation: "event_players";
            referencedColumns: ["event_id", "id"];
          },
          {
            foreignKeyName: "matches_event_id_team_two_player_one_id_fkey";
            columns: ["event_id", "team_two_player_one_id"];
            isOneToOne: false;
            referencedRelation: "event_players";
            referencedColumns: ["event_id", "id"];
          },
          {
            foreignKeyName: "matches_event_id_team_two_player_two_id_fkey";
            columns: ["event_id", "team_two_player_two_id"];
            isOneToOne: false;
            referencedRelation: "event_players";
            referencedColumns: ["event_id", "id"];
          },
        ];
      };
      match_corrections: {
        Row: {
          id: string;
          workspace_id: string;
          event_id: string;
          match_id: string;
          corrected_by_app_user_id: string;
          correction_type: string;
          previous_status: string;
          previous_team_one_score: number | null;
          previous_team_two_score: number | null;
          new_status: string;
          new_team_one_score: number | null;
          new_team_two_score: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          event_id: string;
          match_id: string;
          corrected_by_app_user_id: string;
          correction_type: string;
          previous_status: string;
          previous_team_one_score?: number | null;
          previous_team_two_score?: number | null;
          new_status: string;
          new_team_one_score?: number | null;
          new_team_two_score?: number | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["match_corrections"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      archive_completed_event: {
        Args: { p_workspace_id: string; p_event_id: string };
        Returns: undefined;
      };
      archive_live_event: {
        Args: { p_workspace_id: string; p_event_id: string };
        Returns: undefined;
      };
      cancel_live_event: {
        Args: { p_workspace_id: string; p_event_id: string };
        Returns: undefined;
      };
      complete_live_event: {
        Args: { p_workspace_id: string; p_event_id: string };
        Returns: undefined;
      };
      correct_completed_match_score: {
        Args: {
          p_workspace_id: string;
          p_event_id: string;
          p_match_id: string;
          p_actor_id: string;
          p_team_one_score: number;
          p_team_two_score: number;
        };
        Returns: undefined;
      };
      reopen_completed_match: {
        Args: {
          p_workspace_id: string;
          p_event_id: string;
          p_match_id: string;
          p_actor_id: string;
        };
        Returns: undefined;
      };
      replace_scheduled_event_draw: {
        Args: {
          p_workspace_id: string;
          p_event_id: string;
          p_expected_seed: number;
          p_expected_draw_strategy: string;
          p_draw_strategy: string;
          p_seed: number;
          p_round_minutes: number;
          p_break_minutes: number;
          p_snapshots: Json;
          p_rounds: Json;
        };
        Returns: undefined;
      };
      restore_archived_event: {
        Args: { p_workspace_id: string; p_event_id: string };
        Returns: undefined;
      };
      set_completed_event_standings_eligibility: {
        Args: {
          p_workspace_id: string;
          p_event_id: string;
          p_standings_eligible: boolean;
        };
        Returns: undefined;
      };
      update_scheduled_round_draw: {
        Args: {
          p_event_id: string;
          p_round_id: string;
          p_assignments: Json;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
