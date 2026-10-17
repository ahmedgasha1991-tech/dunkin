-- =============================================================================
-- DUNKIN' COMPLETE SUPABASE DATABASE SETUP & SCHEMA
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. Create Enums / Types ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE mode AS ENUM ('simple', 'detailed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE unit_code AS ENUM ('CTN', 'PKT', 'PCS');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE period AS ENUM ('weekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE audit_type AS ENUM ('weekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE audit_status AS ENUM ('draft', 'completed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── 2. Create Table: products ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name_ar VARCHAR(512) NOT NULL,
  name_en VARCHAR(512) NOT NULL,
  category VARCHAR(255) NOT NULL,
  mode mode NOT NULL DEFAULT 'simple',
  qty INTEGER,
  packs INTEGER,
  pack_size INTEGER,
  loose INTEGER,
  order_qty INTEGER,
  unit_code unit_code NOT NULL,
  unit_label VARCHAR(64) NOT NULL,
  image_url VARCHAR(1024),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── 3. Create Table: inventory_snapshots ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id SERIAL PRIMARY KEY,
  period period NOT NULL,
  captured_at TIMESTAMP NOT NULL DEFAULT NOW(),
  data TEXT NOT NULL
);

-- ── 4. Create Table: inventory_audits ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_audits (
  id SERIAL PRIMARY KEY,
  audit_type audit_type NOT NULL,
  auditor_name VARCHAR(255) NOT NULL,
  notes TEXT,
  status audit_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── 5. Create Table: inventory_audit_items ───────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_audit_items (
  id SERIAL PRIMARY KEY,
  audit_id INTEGER NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
  product_code VARCHAR(64) NOT NULL,
  product_name VARCHAR(512) NOT NULL,
  category VARCHAR(255) NOT NULL,
  unit VARCHAR(64) NOT NULL,
  system_qty INTEGER,
  actual_qty INTEGER,
  difference INTEGER,
  item_notes TEXT
);

-- ── 6. Create Table: branches (جدول الفروع) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_code TEXT UNIQUE NOT NULL,
  branch_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 7. Create Table: employee_requests (طلبات الموظفين) ──────────────────────
CREATE TABLE IF NOT EXISTS employee_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  branch_code TEXT REFERENCES branches(branch_code) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 8. Create Table: employees (الموظفين المعتمدين) ──────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  branch_code TEXT REFERENCES branches(branch_code) ON DELETE CASCADE,
  role TEXT DEFAULT 'staff',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 9. Create Table: admin_submissions (التقارير والطلبات للأدمن) ────────────
CREATE TABLE IF NOT EXISTS admin_submissions (
  id TEXT PRIMARY KEY,
  type TEXT,
  title TEXT,
  employee_name TEXT,
  employee_id TEXT,
  branch_code TEXT,
  branch_name TEXT,
  status TEXT DEFAULT 'pending',
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 10. Enable Row Level Security (RLS) & Policies ───────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access to products" ON products;
CREATE POLICY "Public access to products" ON products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to snapshots" ON inventory_snapshots;
CREATE POLICY "Public access to snapshots" ON inventory_snapshots FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to audits" ON inventory_audits;
CREATE POLICY "Public access to audits" ON inventory_audits FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access to audit items" ON inventory_audit_items;
CREATE POLICY "Public access to audit items" ON inventory_audit_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read branches" ON branches;
CREATE POLICY "Allow read branches" ON branches FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on requests" ON employee_requests;
CREATE POLICY "Allow all on requests" ON employee_requests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on employees" ON employees;
CREATE POLICY "Allow all on employees" ON employees FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on submissions" ON admin_submissions;
CREATE POLICY "Allow all on submissions" ON admin_submissions FOR ALL USING (true) WITH CHECK (true);

-- ── 11. Insert Default Data (Branches & Admin) ───────────────────────────────
INSERT INTO branches (branch_code, branch_name) VALUES
  ('1010001', 'فرع الرياض الرئيسي - العليا'),
  ('1010002', 'فرع جدة - الكورنيش'),
  ('1010003', 'فرع الدمام - الشاطئ'),
  ('BR-101', 'فرع الرياض الرئيسي - العليا (BR-101)'),
  ('BR-102', 'فرع جدة - الكورنيش (BR-102)'),
  ('BR-103', 'فرع الدمام - الشاطئ (BR-103)')
ON CONFLICT (branch_code) DO NOTHING;

INSERT INTO employees (employee_id, full_name, branch_code, role, is_active) VALUES
  ('10001', 'مدير النظام (الأدمن)', '1010001', 'admin', true),
  ('admin', 'مدير النظام (الأدمن)', '1010001', 'admin', true),
  ('EMP-1001', 'أحمد محمود العتيبي', 'BR-101', 'admin', true)
ON CONFLICT (employee_id) DO NOTHING;

-- ── 12. RPC Functions ────────────────────────────────────────────────────────

-- RPC 1: submit_employee_request
CREATE OR REPLACE FUNCTION submit_employee_request(
  p_full_name TEXT,
  p_employee_id TEXT,
  p_branch_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_branch_active BOOLEAN;
  v_branch_name TEXT;
BEGIN
  p_full_name := trim(p_full_name);
  p_employee_id := trim(p_employee_id);
  p_branch_code := trim(p_branch_code);

  IF p_full_name IS NULL OR p_full_name = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'يرجى إدخال اسم الموظف الكامل');
  END IF;

  IF p_employee_id IS NULL OR p_employee_id = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'يرجى إدخال الرقم الوظيفي المطلوب');
  END IF;

  IF p_branch_code IS NULL OR p_branch_code = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'يرجى إدخال رقم الفرع');
  END IF;

  SELECT is_active, branch_name INTO v_branch_active, v_branch_name
  FROM branches
  WHERE branch_code = p_branch_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'رقم الفرع غير موجود في قاعدة البيانات');
  END IF;

  IF NOT v_branch_active THEN
    RETURN jsonb_build_object('success', false, 'message', 'هذا الفرع معطل حالياً من قبل الإدارة');
  END IF;

  IF EXISTS (SELECT 1 FROM employees WHERE employee_id = p_employee_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'هذا الرقم الوظيفي مسجل لموظف معتمد بالفعل');
  END IF;

  INSERT INTO employee_requests (full_name, employee_id, branch_code, status)
  VALUES (p_full_name, p_employee_id, p_branch_code, 'pending')
  ON CONFLICT (employee_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        branch_code = EXCLUDED.branch_code,
        status = 'pending',
        rejection_reason = NULL,
        created_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'message', 'تم رفع طلب الحساب بنجاح! حسابك حالياً بانتظار مراجعة وموافقة الإدارة (الأدمن)'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- RPC 2: login_employee
CREATE OR REPLACE FUNCTION login_employee(
  p_branch_code TEXT,
  p_employee_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_emp RECORD;
  v_req RECORD;
BEGIN
  p_branch_code := trim(p_branch_code);
  p_employee_id := trim(p_employee_id);

  IF p_branch_code IS NULL OR p_branch_code = '' OR p_employee_id IS NULL OR p_employee_id = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'يرجى إدخال رقم الفرع والرقم الوظيفي');
  END IF;

  SELECT e.*, b.branch_name, b.is_active AS branch_active
  INTO v_emp
  FROM employees e
  JOIN branches b ON e.branch_code = b.branch_code
  WHERE e.employee_id = p_employee_id AND e.branch_code = p_branch_code;

  IF FOUND THEN
    IF NOT v_emp.branch_active THEN
      RETURN jsonb_build_object('success', false, 'message', 'هذا الفرع معطل حالياً من قبل الإدارة');
    END IF;

    IF NOT v_emp.is_active THEN
      RETURN jsonb_build_object('success', false, 'message', 'حسابك معطل حالياً من قبل الأدمن');
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'approved',
      'message', 'تم تسجيل الدخول بنجاح',
      'session', jsonb_build_object(
        'id', v_emp.id,
        'employee_id', v_emp.employee_id,
        'full_name', v_emp.full_name,
        'branch_code', v_emp.branch_code,
        'branch_name', v_emp.branch_name,
        'role', v_emp.role,
        'logged_at', now()
      )
    );
  END IF;

  SELECT er.*, b.branch_name
  INTO v_req
  FROM employee_requests er
  LEFT JOIN branches b ON er.branch_code = b.branch_code
  WHERE er.employee_id = p_employee_id;

  IF FOUND THEN
    IF v_req.status = 'pending' THEN
      RETURN jsonb_build_object(
        'success', false,
        'status', 'pending',
        'message', 'طلبك ما زال قيد المراجعة وبانتظار موافقة الأدمن.'
      );
    ELSIF v_req.status = 'rejected' THEN
      RETURN jsonb_build_object(
        'success', false,
        'status', 'rejected',
        'message', COALESCE('تم رفض طلب تسجيل حسابك من قبل الأدمن. السبب: ' || v_req.rejection_reason, 'تم رفض طلب حسابك من قبل الإدارة.')
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', false, 'message', 'بيانات الدخول غير صحيحة. تحقق من رقم الفرع والرقم الوظيفي.');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- RPC 3: approve_employee_request
CREATE OR REPLACE FUNCTION approve_employee_request(
  p_request_id UUID,
  p_role TEXT DEFAULT 'staff'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req RECORD;
BEGIN
  SELECT * INTO v_req FROM employee_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'طلب التسجيل غير موجود');
  END IF;

  INSERT INTO employees (employee_id, full_name, branch_code, role, is_active)
  VALUES (v_req.employee_id, v_req.full_name, v_req.branch_code, COALESCE(p_role, 'staff'), true)
  ON CONFLICT (employee_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        branch_code = EXCLUDED.branch_code,
        role = EXCLUDED.role,
        is_active = true;

  UPDATE employee_requests SET status = 'approved' WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'message', 'تمت الموافقة على طلب الموظف وتفعيل حسابه بنجاح!');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- RPC 4: reject_employee_request
CREATE OR REPLACE FUNCTION reject_employee_request(
  p_request_id UUID,
  p_reason TEXT DEFAULT 'رفض من قبل الإدارة'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE employee_requests
  SET status = 'rejected',
      rejection_reason = p_reason
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'طلب التسجيل غير موجود');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'تم رفض طلب الموظف');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- RPC 5: toggle_employee_active
CREATE OR REPLACE FUNCTION toggle_employee_active(
  p_employee_id TEXT,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE employees
  SET is_active = p_is_active
  WHERE employee_id = p_employee_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'الموظف غير موجود');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE WHEN p_is_active THEN 'تم تفعيل حساب الموظف' ELSE 'تم تعطيل حساب الموظف' END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- RPC 6: transfer_employee_branch
CREATE OR REPLACE FUNCTION transfer_employee_branch(
  p_employee_id TEXT,
  p_new_branch_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE employees
  SET branch_code = trim(p_new_branch_code)
  WHERE employee_id = trim(p_employee_id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'الموظف غير موجود');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'تم نقل الموظف للفرع بنجاح');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- RPC 7: fast_employee_login
CREATE OR REPLACE FUNCTION fast_employee_login(
  p_branch_code TEXT,
  p_employee_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT
    e.id,
    e.employee_id,
    e.full_name,
    e.branch_code,
    b.branch_name,
    e.role,
    e.is_active AS emp_active,
    b.is_active AS branch_active
  INTO v_result
  FROM employees e
  JOIN branches b ON e.branch_code = b.branch_code
  WHERE e.employee_id = trim(p_employee_id)
    AND e.branch_code = trim(p_branch_code);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'بيانات الدخول غير صحيحة');
  END IF;

  IF NOT v_result.branch_active THEN
    RETURN jsonb_build_object('success', false, 'message', 'الفرع معطل');
  END IF;

  IF NOT v_result.emp_active THEN
    RETURN jsonb_build_object('success', false, 'message', 'الحساب معطل');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'تم تسجيل الدخول بنجاح',
    'session', jsonb_build_object(
      'id', v_result.id,
      'employee_id', v_result.employee_id,
      'full_name', v_result.full_name,
      'branch_code', v_result.branch_code,
      'branch_name', v_result.branch_name,
      'role', v_result.role,
      'logged_at', now()
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- ── 13. Create Storage Bucket (product-images) ───────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public View product-images" ON storage.objects;
CREATE POLICY "Public View product-images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public Upload product-images" ON storage.objects;
CREATE POLICY "Public Upload product-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public Update product-images" ON storage.objects;
CREATE POLICY "Public Update product-images" ON storage.objects FOR UPDATE USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public Delete product-images" ON storage.objects;
CREATE POLICY "Public Delete product-images" ON storage.objects FOR DELETE USING (bucket_id = 'product-images');
