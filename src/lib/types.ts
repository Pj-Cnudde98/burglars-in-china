export type Trip = { id: string; code: string; name: string; start_date: string; end_date: string }
export type Member = { id: string; trip_id: string; name: string }
export type Stay = {
  id: string; trip_id: string; city: string; city_zh: string | null; name: string
  address_zh: string | null; address_en: string | null; phone: string | null
  check_in: string; check_out: string; booking_ref: string | null; notes: string | null
  lat: number | null; lng: number | null
}
export type EventKind = 'travel' | 'sight' | 'food' | 'free' | 'stay'
export type TripEvent = {
  id: string; trip_id: string; day: string; start_time: string | null; title: string
  place_zh: string | null; kind: EventKind; notes: string | null; lat: number | null; lng: number | null
}
export type Transport = {
  id: string; trip_id: string; kind: 'flight' | 'train' | 'bus' | 'other'
  from_place: string; to_place: string; from_zh: string | null; to_zh: string | null
  depart_at: string; arrive_at: string | null; depart_tz: string; arrive_tz: string; code: string | null; booking_ref: string | null
  seat: string | null; file_path: string | null; notes: string | null
}
export type Restaurant = {
  id: string; trip_id: string; city: string; name: string; name_zh: string | null
  dish: string | null; notes: string | null; added_by: string | null; created_at: string
}
export type Vote = { restaurant_id: string; member_id: string; trip_id: string; value: 1 | 0 | -1 }
export type Expense = {
  id: string; trip_id: string; description: string; amount: number; currency: string
  paid_by: string; split_with: string[]; created_by: string | null; created_at: string
}
export type Message = {
  id: string; trip_id: string; member_id: string | null; kind: 'text' | 'bolleke'; body: string; created_at: string
}
export type LiveLocation = {
  member_id: string; trip_id: string; lat: number; lng: number; accuracy: number | null
  expires_at: string; updated_at: string
}

export type TripData = {
  trip: Trip | null
  members: Member[]
  stays: Stay[]
  events: TripEvent[]
  transport: Transport[]
  restaurants: Restaurant[]
  votes: Vote[]
  expenses: Expense[]
  messages: Message[]
  locations: LiveLocation[]
}

export type Session = { memberId: string; tripId: string; name: string; isAdmin: boolean }
