export type Database = {
  public: {
    Tables: {
      salas: {
        Row: {
          id: string
          codigo: string
          nombre: string
          creado_en: string
        }
        Insert: {
          id?: string
          codigo: string
          nombre: string
          creado_en?: string
        }
        Update: {
          id?: string
          codigo?: string
          nombre?: string
          creado_en?: string
        }
        Relationships: []
      }
      miembros: {
        Row: {
          id: string
          sala_id: string
          nombre: string
          color: string
          password_hash: string | null
          salt: string | null
          user_id: string | null
          telefono: string | null
          whatsapp_phone: string | null
          creado_en: string
        }
        Insert: {
          id?: string
          sala_id: string
          nombre: string
          color?: string
          password_hash?: string | null
          salt?: string | null
          user_id?: string | null
          telefono?: string | null
          whatsapp_phone?: string | null
          creado_en?: string
        }
        Update: {
          id?: string
          sala_id?: string
          nombre?: string
          color?: string
          password_hash?: string | null
          salt?: string | null
          user_id?: string | null
          telefono?: string | null
          whatsapp_phone?: string | null
          creado_en?: string
        }
        Relationships: []
      }
      invitaciones: {
        Row: {
          id: string
          sala_id: string
          token: string
          creado_por: string | null
          usado_en: string | null
          creado_en: string
          expires_at: string
        }
        Insert: {
          id?: string
          sala_id: string
          token?: string
          creado_por?: string | null
          usado_en?: string | null
          creado_en?: string
          expires_at?: string
        }
        Update: {
          id?: string
          sala_id?: string
          token?: string
          creado_por?: string | null
          usado_en?: string | null
          creado_en?: string
          expires_at?: string
        }
        Relationships: []
      }
      pisos: {
        Row: {
          id: string
          sala_id: string
          titulo: string
          url: string | null
          precio: number | null
          m2: number | null
          zona: string | null
          notas: string | null
          fotos: string[]
          direccion: string | null
          videos: string[]
          creado_en: string
        }
        Insert: {
          id?: string
          sala_id: string
          titulo: string
          url?: string | null
          precio?: number | null
          m2?: number | null
          zona?: string | null
          notas?: string | null
          fotos?: string[]
          direccion?: string | null
          videos?: string[]
          creado_en?: string
        }
        Update: {
          id?: string
          sala_id?: string
          titulo?: string
          url?: string | null
          precio?: number | null
          m2?: number | null
          zona?: string | null
          notas?: string | null
          fotos?: string[]
          direccion?: string | null
          videos?: string[]
          creado_en?: string
        }
        Relationships: []
      }
      votos_piso: {
        Row: {
          id: string
          piso_id: string
          miembro_id: string
          puntuacion: number
          comentario: string | null
          creado_en: string
        }
        Insert: {
          id?: string
          piso_id: string
          miembro_id: string
          puntuacion: number
          comentario?: string | null
          creado_en?: string
        }
        Update: {
          id?: string
          piso_id?: string
          miembro_id?: string
          puntuacion?: number
          comentario?: string | null
          creado_en?: string
        }
        Relationships: []
      }
      gastos: {
        Row: {
          id: string
          sala_id: string
          descripcion: string
          importe: number
          categoria: 'alquiler' | 'suministros' | 'internet' | 'comida' | 'limpieza' | 'otro'
          pagado_por: string | null
          tipo: 'fijo' | 'variable'
          fecha: string
          splits: Record<string, number> | null
          creado_en: string
        }
        Insert: {
          id?: string
          sala_id: string
          descripcion: string
          importe: number
          categoria: 'alquiler' | 'suministros' | 'internet' | 'comida' | 'limpieza' | 'otro'
          pagado_por?: string | null
          tipo: 'fijo' | 'variable'
          fecha?: string
          splits?: Record<string, number> | null
          creado_en?: string
        }
        Update: {
          id?: string
          sala_id?: string
          descripcion?: string
          importe?: number
          categoria?: 'alquiler' | 'suministros' | 'internet' | 'comida' | 'limpieza' | 'otro'
          pagado_por?: string | null
          tipo?: 'fijo' | 'variable'
          fecha?: string
          splits?: Record<string, number> | null
          creado_en?: string
        }
        Relationships: []
      }
      items_compra: {
        Row: {
          id: string
          sala_id: string
          nombre: string
          cantidad: number
          completado: boolean
          añadido_por: string | null
          creado_en: string
        }
        Insert: {
          id?: string
          sala_id: string
          nombre: string
          cantidad?: number
          completado?: boolean
          añadido_por?: string | null
          creado_en?: string
        }
        Update: {
          id?: string
          sala_id?: string
          nombre?: string
          cantidad?: number
          completado?: boolean
          añadido_por?: string | null
          creado_en?: string
        }
        Relationships: []
      }
      pagos: {
        Row: {
          id: string
          sala_id: string
          de_id: string
          a_id: string
          importe: number
          nota: string | null
          fecha: string
          creado_en: string
        }
        Insert: {
          id?: string
          sala_id: string
          de_id: string
          a_id: string
          importe: number
          nota?: string | null
          fecha?: string
          creado_en?: string
        }
        Update: {
          id?: string
          sala_id?: string
          de_id?: string
          a_id?: string
          importe?: number
          nota?: string | null
          fecha?: string
          creado_en?: string
        }
        Relationships: []
      }
      tareas: {
        Row: {
          id: string
          sala_id: string
          nombre: string
          asignada_a: string | null
          semana: string
          completada: boolean
          creado_en: string
        }
        Insert: {
          id?: string
          sala_id: string
          nombre: string
          asignada_a?: string | null
          semana: string
          completada?: boolean
          creado_en?: string
        }
        Update: {
          id?: string
          sala_id?: string
          nombre?: string
          asignada_a?: string | null
          semana?: string
          completada?: boolean
          creado_en?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          miembro_id: string
          sala_id: string
          endpoint: string
          p256dh: string
          auth: string
          creado_en: string
        }
        Insert: {
          id?: string
          miembro_id: string
          sala_id: string
          endpoint: string
          p256dh: string
          auth: string
          creado_en?: string
        }
        Update: {
          id?: string
          miembro_id?: string
          sala_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          creado_en?: string
        }
        Relationships: []
      }
      whatsapp_pending_confirmations: {
        Row: {
          id: string
          miembro_id: string
          accion: object
          expires_at: string
          creado_en: string
        }
        Insert: {
          id?: string
          miembro_id: string
          accion: object
          expires_at: string
          creado_en?: string
        }
        Update: {
          id?: string
          miembro_id?: string
          accion?: object
          expires_at?: string
          creado_en?: string
        }
        Relationships: []
      }
      whatsapp_link_codes: {
        Row: {
          id: string
          miembro_id: string
          sala_id: string
          code: string
          expires_at: string
          creado_en: string
        }
        Insert: {
          id?: string
          miembro_id: string
          sala_id: string
          code: string
          expires_at: string
          creado_en?: string
        }
        Update: {
          id?: string
          miembro_id?: string
          sala_id?: string
          code?: string
          expires_at?: string
          creado_en?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Tipos de conveniencia
export type Sala = Database['public']['Tables']['salas']['Row']
export type Miembro = Database['public']['Tables']['miembros']['Row']
export type Invitacion = Database['public']['Tables']['invitaciones']['Row']
export type Piso = Database['public']['Tables']['pisos']['Row']
export type VotoPiso = Database['public']['Tables']['votos_piso']['Row']
export type Gasto = Database['public']['Tables']['gastos']['Row']
export type ItemCompra = Database['public']['Tables']['items_compra']['Row']
export type Tarea = Database['public']['Tables']['tareas']['Row']
export type Pago = Database['public']['Tables']['pagos']['Row']
