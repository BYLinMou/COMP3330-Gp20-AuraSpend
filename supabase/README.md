# Supabase Setup Guide

This guide helps you set up your own Supabase backend and initialize the database using SQL.

## Steps

1. Sign up and log in to [Supabase](https://supabase.com/).
2. Create a new project and get your `URL` and `Anon Key`.
3. In the Supabase dashboard, go to the SQL Editor and run the following SQL to initialize your tables:

```sql
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
CREATE TABLE public.api (
  id uuid NOT NULL,
  url text,
  key text,
  receipt_key text,
  chat_model text,
  fallback_model text,
  CONSTRAINT api_pkey PRIMARY KEY (id),
  CONSTRAINT api_id_fkey FOREIGN KEY (id) REFERENCES public.profiles(id)
);
CREATE TABLE public.budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period text NOT NULL CHECK (period = ANY (ARRAY['monthly'::text, 'yearly'::text])),
  amount numeric NOT NULL,
  start_date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT budgets_pkey PRIMARY KEY (id),
  CONSTRAINT budgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  item_name text,
  item_amount bigint,
  item_price double precision,
  user_id uuid NOT NULL,
  CONSTRAINT items_pkey PRIMARY KEY (id),
  CONSTRAINT item_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT item_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id)
);
CREATE TABLE public.pet_outfits (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  outfit_name text NOT NULL,
  xp_cost integer NOT NULL,
  is_unlocked boolean NOT NULL DEFAULT false,
  is_wearing boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pet_outfits_pkey PRIMARY KEY (id),
  CONSTRAINT pet_outfits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.pet_state (
  user_id uuid NOT NULL,
  mood integer NOT NULL DEFAULT 50,
  hunger integer NOT NULL DEFAULT 100,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  last_feed_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  current_pet_id uuid,
  CONSTRAINT pet_state_pkey PRIMARY KEY (user_id),
  CONSTRAINT pet_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT pet_state_current_pet_id_fkey FOREIGN KEY (current_pet_id) REFERENCES public.user_pets(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamp with time zone DEFAULT now(),
  username text,
  primary_currency text,
  income numeric,
  preferred_language text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  occurred_at timestamp with time zone NOT NULL,
  merchant text,
  category_id uuid,
  source text DEFAULT 'manual'::text CHECK (source = ANY (ARRAY['manual'::text, 'ocr'::text, 'ai'::text])),
  note text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  payment_method text,
  currency text NOT NULL DEFAULT 'HKD'::text,
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.user_pets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pet_type text NOT NULL,
  pet_breed text NOT NULL,
  pet_name text NOT NULL,
  pet_emoji text NOT NULL,
  is_active boolean DEFAULT false,
  purchased_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_pets_pkey PRIMARY KEY (id),
  CONSTRAINT user_pets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
```

4. Copy your `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` into the `.env` file in the project root.

## Notes

- You can adjust the table structure to fit your needs.
- For more details on table fields and usage, check the source code in `src/services/`.
