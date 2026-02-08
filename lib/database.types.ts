export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          avatar_url: string | null
          website: string | null
          email: string | null
          role: string | null
          created_at: string | null
          manual_reputation_score?: number | null
          manual_sales_count?: number | null
          admin_notes?: string | null
          is_official_store?: boolean
          official_store_name?: string | null
          official_store_banner_url?: string | null
          official_store_brand_color?: string | null
        }
        Insert: {
          id: string
          full_name?: string | null
          avatar_url?: string | null
          website?: string | null
          email?: string | null
          role?: string | null
          created_at?: string | null
          manual_reputation_score?: number | null
          manual_sales_count?: number | null
          admin_notes?: string | null
          is_official_store?: boolean
          official_store_name?: string | null
          official_store_banner_url?: string | null
          official_store_brand_color?: string | null
        }
        Update: {
          id?: string
          full_name?: string | null
          avatar_url?: string | null
          website?: string | null
          email?: string | null
          role?: string | null
          created_at?: string | null
          manual_reputation_score?: number | null
          manual_sales_count?: number | null
          admin_notes?: string | null
          is_official_store?: boolean
          official_store_name?: string | null
          official_store_banner_url?: string | null
          official_store_brand_color?: string | null
        }
      }
      listings: {
        Row: {
          id: string
          title: string
          description: string | null
          price: number
          status: string
          seller_id: string
          created_at: string
          images: string[] | null
          is_featured: boolean
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          price: number
          status?: string
          seller_id: string
          created_at?: string
          images?: string[] | null
          is_featured?: boolean
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          price?: number
          status?: string
          seller_id?: string
          created_at?: string
          images?: string[] | null
          is_featured?: boolean
        }
      }
      // Add other tables as needed or use 'any' for flexibility if types are complex
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
