-- =========================================================================
-- MALABON PHARMACY POS & INVENTORY SYSTEM
-- DATABASE SCHEMA MIGRATION: PHOTO STORAGE IN SUPABASE (NOT LOCAL STORAGE)
-- =========================================================================
-- Run this script in your Supabase Project Dashboard -> SQL Editor -> Run
-- This adds the necessary columns to store payment proof photos and 
-- staff attendance verification selfie photos directly in the database.
-- =========================================================================

-- 1. Add payment proof photo and reference number to the sales table
ALTER TABLE IF EXISTS public.sales 
    ADD COLUMN IF NOT EXISTS payment_proof_photo text,
    ADD COLUMN IF NOT EXISTS reference_number text;

-- 2. Add time-in verification selfie photo to staff attendance table
ALTER TABLE IF EXISTS public.staff_attendance 
    ADD COLUMN IF NOT EXISTS time_in_photo text;

-- 3. Add optional stock column to inventory to support legacy direct stock references
ALTER TABLE IF EXISTS public.inventory 
    ADD COLUMN IF NOT EXISTS stock integer DEFAULT 0;

-- 4. Update or recreate view_sales_history to include the photo and reference columns
CREATE OR REPLACE VIEW public.view_sales_history AS
SELECT 
    s.id,
    s.date,
    s.total,
    s.payment_method,
    s.online_channel,
    s.senior_discount,
    s.is_refunded,
    s.processed_by,
    s.gross_total,
    s.subtotal,
    s.discount,
    s.taxable_base,
    s.vat,
    s.cash_received,
    s.change,
    s.discount_label,
    s.customer_name,
    s.reference_number,
    s.payment_proof_photo,
    COALESCE(
        json_agg(
            json_build_object(
                'id', si.id,
                'quantity', si.quantity,
                'unit_price', si.unit_price,
                'inventory', json_build_object(
                    'id', inv.id,
                    'name', inv.name,
                    'category', inv.category,
                    'min_stock', inv.min_stock,
                    'barcode', inv.barcode,
                    'manufacturer', inv.manufacturer
                )
            )
        ) FILTER (WHERE si.id IS NOT NULL),
        '[]'::json
    ) AS sale_items
FROM public.sales s
LEFT JOIN public.sale_items si ON s.id = si.sale_id
LEFT JOIN public.inventory inv ON si.item_id = inv.id
GROUP BY s.id;

-- 5. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
