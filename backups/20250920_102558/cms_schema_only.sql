--
-- PostgreSQL database dump
--

\restrict 1AuOS1FLnlVC1yGMG6aAkMCWZXdB1t0v3FQja62qlkBO62zqDmSdr1uOI8u9nAV

-- Dumped from database version 15.14 (Debian 15.14-1.pgdg13+1)
-- Dumped by pg_dump version 15.14 (Debian 15.14-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: cms
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO cms;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: cms
--

COMMENT ON SCHEMA public IS '';


--
-- Name: AppointmentStatus; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."AppointmentStatus" AS ENUM (
    'SCHEDULED',
    'CONFIRMED',
    'CHECKED_IN',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW'
);


ALTER TYPE public."AppointmentStatus" OWNER TO cms;

--
-- Name: ConsentType; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."ConsentType" AS ENUM (
    'GENERAL_CARE',
    'PROCEDURE_SPECIFIC',
    'TELEMED',
    'DATA_PROCESSING'
);


ALTER TYPE public."ConsentType" OWNER TO cms;

--
-- Name: InventoryItemType; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."InventoryItemType" AS ENUM (
    'MEDICINE',
    'EQUIPMENT',
    'SUPPLY',
    'CONSUMABLE'
);


ALTER TYPE public."InventoryItemType" OWNER TO cms;

--
-- Name: InventoryStatus; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."InventoryStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'DISCONTINUED'
);


ALTER TYPE public."InventoryStatus" OWNER TO cms;

--
-- Name: Language; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."Language" AS ENUM (
    'EN',
    'TE',
    'HI'
);


ALTER TYPE public."Language" OWNER TO cms;

--
-- Name: PaymentMode; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."PaymentMode" AS ENUM (
    'CASH',
    'CARD',
    'UPI',
    'BNPL'
);


ALTER TYPE public."PaymentMode" OWNER TO cms;

--
-- Name: PurchaseOrderStatus; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."PurchaseOrderStatus" AS ENUM (
    'DRAFT',
    'PENDING',
    'APPROVED',
    'ORDERED',
    'RECEIVED',
    'CANCELLED'
);


ALTER TYPE public."PurchaseOrderStatus" OWNER TO cms;

--
-- Name: StockAdjustmentType; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."StockAdjustmentType" AS ENUM (
    'PHYSICAL_COUNT',
    'DAMAGE',
    'EXPIRY',
    'THEFT',
    'TRANSFER',
    'CORRECTION'
);


ALTER TYPE public."StockAdjustmentType" OWNER TO cms;

--
-- Name: StockMovementType; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."StockMovementType" AS ENUM (
    'IN',
    'OUT',
    'TRANSFER',
    'ADJUSTMENT'
);


ALTER TYPE public."StockMovementType" OWNER TO cms;

--
-- Name: StockStatus; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."StockStatus" AS ENUM (
    'IN_STOCK',
    'LOW_STOCK',
    'OUT_OF_STOCK',
    'EXPIRED'
);


ALTER TYPE public."StockStatus" OWNER TO cms;

--
-- Name: TransactionType; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."TransactionType" AS ENUM (
    'PURCHASE',
    'SALE',
    'RETURN',
    'ADJUSTMENT',
    'TRANSFER',
    'EXPIRED',
    'DAMAGED'
);


ALTER TYPE public."TransactionType" OWNER TO cms;

--
-- Name: UnitType; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."UnitType" AS ENUM (
    'PIECES',
    'BOXES',
    'BOTTLES',
    'STRIPS',
    'TUBES',
    'VIALS',
    'AMPOULES',
    'SYRINGES',
    'PACKS',
    'KITS'
);


ALTER TYPE public."UnitType" OWNER TO cms;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."UserRole" AS ENUM (
    'OWNER',
    'ADMIN',
    'DOCTOR',
    'NURSE',
    'RECEPTION',
    'ACCOUNTANT',
    'PHARMACIST',
    'LAB_TECH',
    'MANAGER',
    'PATIENT'
);


ALTER TYPE public."UserRole" OWNER TO cms;

--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED',
    'PENDING'
);


ALTER TYPE public."UserStatus" OWNER TO cms;

--
-- Name: VisitType; Type: TYPE; Schema: public; Owner: cms
--

CREATE TYPE public."VisitType" AS ENUM (
    'OPD',
    'TELEMED',
    'PROCEDURE'
);


ALTER TYPE public."VisitType" OWNER TO cms;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Drug; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public."Drug" (
    id text NOT NULL,
    name text NOT NULL,
    "genericName" text,
    strength text,
    form text,
    route text,
    manufacturer text,
    composition text,
    "brandNames" text,
    aliases text,
    "hsnCode" text,
    "rxRequired" boolean DEFAULT true NOT NULL,
    "isGeneric" boolean DEFAULT false NOT NULL,
    metadata text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Drug" OWNER TO cms;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO cms;

--
-- Name: appointments; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.appointments (
    id text NOT NULL,
    "patientId" text NOT NULL,
    "doctorId" text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    slot text NOT NULL,
    status public."AppointmentStatus" DEFAULT 'SCHEDULED'::public."AppointmentStatus" NOT NULL,
    "visitType" public."VisitType" DEFAULT 'OPD'::public."VisitType" NOT NULL,
    notes text,
    source text,
    "branchId" text NOT NULL,
    "roomId" text,
    "tokenNumber" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.appointments OWNER TO cms;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    "userId" text,
    action text NOT NULL,
    entity text NOT NULL,
    "entityId" text NOT NULL,
    "oldValues" text,
    "newValues" text,
    "ipAddress" text,
    "userAgent" text,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO cms;

--
-- Name: branches; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.branches (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    address text NOT NULL,
    city text,
    state text,
    pincode text,
    phone text,
    email text,
    website text,
    "gstNumber" text,
    "licenseNumber" text,
    "isActive" boolean DEFAULT true NOT NULL,
    metadata text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.branches OWNER TO cms;

--
-- Name: consents; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.consents (
    id text NOT NULL,
    "patientId" text NOT NULL,
    "visitId" text,
    "consentType" public."ConsentType" NOT NULL,
    language public."Language" DEFAULT 'EN'::public."Language" NOT NULL,
    text text NOT NULL,
    "signedAt" timestamp(3) without time zone,
    signer text,
    method text,
    "pdfUrl" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.consents OWNER TO cms;

--
-- Name: device_logs; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.device_logs (
    id text NOT NULL,
    "patientId" text NOT NULL,
    "visitId" text NOT NULL,
    "deviceModel" text NOT NULL,
    "serialNo" text NOT NULL,
    parameters text NOT NULL,
    "operatorId" text NOT NULL,
    "photoRefs" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.device_logs OWNER TO cms;

--
-- Name: inventory_audits; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.inventory_audits (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "itemId" text NOT NULL,
    "auditorId" text NOT NULL,
    "auditDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "physicalStock" integer NOT NULL,
    "systemStock" integer NOT NULL,
    variance integer NOT NULL,
    notes text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.inventory_audits OWNER TO cms;

--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.inventory_items (
    id text NOT NULL,
    "branchId" text NOT NULL,
    name text NOT NULL,
    description text,
    "genericName" text,
    "brandName" text,
    type public."InventoryItemType" NOT NULL,
    category text,
    "subCategory" text,
    manufacturer text,
    supplier text,
    barcode text,
    sku text,
    "costPrice" double precision NOT NULL,
    "sellingPrice" double precision NOT NULL,
    mrp double precision,
    unit public."UnitType" NOT NULL,
    "packSize" integer,
    "packUnit" text,
    "currentStock" integer DEFAULT 0 NOT NULL,
    "minStockLevel" integer,
    "maxStockLevel" integer,
    "reorderLevel" integer,
    "reorderQuantity" integer,
    "expiryDate" timestamp(3) without time zone,
    "batchNumber" text,
    "hsnCode" text,
    "gstRate" double precision,
    "requiresPrescription" boolean DEFAULT false NOT NULL,
    "isControlled" boolean DEFAULT false NOT NULL,
    "storageLocation" text,
    "storageConditions" text,
    tags text,
    status public."InventoryStatus" DEFAULT 'ACTIVE'::public."InventoryStatus" NOT NULL,
    "stockStatus" public."StockStatus" DEFAULT 'OUT_OF_STOCK'::public."StockStatus" NOT NULL,
    metadata text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.inventory_items OWNER TO cms;

--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.invoice_items (
    id text NOT NULL,
    "invoiceId" text NOT NULL,
    "serviceId" text NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    "unitPrice" double precision NOT NULL,
    "gstRate" double precision DEFAULT 0 NOT NULL,
    total double precision NOT NULL
);


ALTER TABLE public.invoice_items OWNER TO cms;

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.invoices (
    id text NOT NULL,
    "patientId" text NOT NULL,
    "visitId" text,
    mode public."PaymentMode" DEFAULT 'CASH'::public."PaymentMode" NOT NULL,
    "gstBreakup" text,
    "exemptBreakup" text,
    total double precision NOT NULL,
    received double precision DEFAULT 0 NOT NULL,
    balance double precision NOT NULL,
    "invoiceNo" text NOT NULL,
    gstin text,
    hsn text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.invoices OWNER TO cms;

--
-- Name: lab_orders; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.lab_orders (
    id text NOT NULL,
    "patientId" text NOT NULL,
    "visitId" text NOT NULL,
    tests text NOT NULL,
    partner text NOT NULL,
    status text DEFAULT 'ORDERED'::text NOT NULL,
    "resultsRef" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.lab_orders OWNER TO cms;

--
-- Name: new_invoice_items; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.new_invoice_items (
    id text NOT NULL,
    "invoiceId" text NOT NULL,
    "serviceId" text NOT NULL,
    name text NOT NULL,
    description text,
    qty integer DEFAULT 1 NOT NULL,
    "unitPrice" double precision NOT NULL,
    discount double precision DEFAULT 0 NOT NULL,
    "gstRate" double precision DEFAULT 0 NOT NULL,
    total double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.new_invoice_items OWNER TO cms;

--
-- Name: new_invoices; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.new_invoices (
    id text NOT NULL,
    "invoiceNo" text NOT NULL,
    "patientId" text NOT NULL,
    "visitId" text,
    "appointmentId" text,
    "branchId" text NOT NULL,
    total double precision NOT NULL,
    balance double precision NOT NULL,
    discount double precision DEFAULT 0 NOT NULL,
    "discountReason" text,
    notes text,
    "dueDate" timestamp(3) without time zone,
    metadata text,
    mode text,
    gstin text,
    hsn text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    received double precision DEFAULT 0 NOT NULL
);


ALTER TABLE public.new_invoices OWNER TO cms;

--
-- Name: new_payments; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.new_payments (
    id text NOT NULL,
    "invoiceId" text NOT NULL,
    amount double precision NOT NULL,
    mode public."PaymentMode" NOT NULL,
    reference text,
    gateway text,
    "reconStatus" text DEFAULT 'PENDING'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.new_payments OWNER TO cms;

--
-- Name: patients; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.patients (
    id text NOT NULL,
    "abhaId" text,
    name text NOT NULL,
    gender text NOT NULL,
    dob timestamp(3) without time zone NOT NULL,
    phone text NOT NULL,
    email text,
    address text,
    city text,
    state text,
    pincode text,
    "emergencyContact" text,
    allergies text,
    "photoUrl" text,
    "referralSource" text,
    "secondaryPhone" text,
    "maritalStatus" text,
    "bloodGroup" text,
    occupation text,
    "guardianName" text,
    "medicalHistory" text,
    "portalUserId" text,
    "branchId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.patients OWNER TO cms;

--
-- Name: payments; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.payments (
    id text NOT NULL,
    "invoiceId" text NOT NULL,
    amount double precision NOT NULL,
    mode public."PaymentMode" NOT NULL,
    reference text,
    gateway text,
    "reconStatus" text DEFAULT 'PENDING'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.payments OWNER TO cms;

--
-- Name: permissions; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.permissions (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    resource text NOT NULL,
    action text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.permissions OWNER TO cms;

--
-- Name: prescriptions; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.prescriptions (
    id text NOT NULL,
    "visitId" text NOT NULL,
    language public."Language" DEFAULT 'EN'::public."Language" NOT NULL,
    items text NOT NULL,
    instructions text,
    "genericFirst" boolean DEFAULT true NOT NULL,
    "pharmacistNotes" text,
    qrcode text,
    signature text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.prescriptions OWNER TO cms;

--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.purchase_orders (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "userId" text NOT NULL,
    supplier text NOT NULL,
    "orderDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expectedDeliveryDate" timestamp(3) without time zone,
    status public."PurchaseOrderStatus" DEFAULT 'DRAFT'::public."PurchaseOrderStatus" NOT NULL,
    items text NOT NULL,
    "totalAmount" double precision NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.purchase_orders OWNER TO cms;

--
-- Name: referrals; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.referrals (
    id text NOT NULL,
    "patientId" text NOT NULL,
    source text NOT NULL,
    "commissionScheme" text,
    "payoutStatus" text DEFAULT 'PENDING'::text NOT NULL,
    amount double precision,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.referrals OWNER TO cms;

--
-- Name: reorder_rules; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.reorder_rules (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "itemId" text NOT NULL,
    "userId" text NOT NULL,
    "reorderLevel" integer NOT NULL,
    "reorderQuantity" integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    metadata text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.reorder_rules OWNER TO cms;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.roles (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    permissions text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.roles OWNER TO cms;

--
-- Name: rooms; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.rooms (
    id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    capacity integer DEFAULT 1 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "branchId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.rooms OWNER TO cms;

--
-- Name: services; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.services (
    id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    taxable boolean DEFAULT false NOT NULL,
    "gstRate" double precision DEFAULT 0 NOT NULL,
    "priceMrp" double precision NOT NULL,
    "priceNet" double precision NOT NULL,
    "deviceId" text,
    "branchId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.services OWNER TO cms;

--
-- Name: stock_adjustments; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.stock_adjustments (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "itemId" text NOT NULL,
    "userId" text NOT NULL,
    type public."StockAdjustmentType" NOT NULL,
    quantity integer NOT NULL,
    reason text,
    notes text,
    metadata text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.stock_adjustments OWNER TO cms;

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.stock_movements (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "itemId" text NOT NULL,
    "userId" text NOT NULL,
    type public."StockMovementType" NOT NULL,
    quantity integer NOT NULL,
    "fromLocation" text,
    "toLocation" text,
    reason text,
    notes text,
    metadata text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.stock_movements OWNER TO cms;

--
-- Name: stock_transactions; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.stock_transactions (
    id text NOT NULL,
    "branchId" text NOT NULL,
    "itemId" text NOT NULL,
    "userId" text NOT NULL,
    type public."TransactionType" NOT NULL,
    quantity integer NOT NULL,
    "unitPrice" double precision NOT NULL,
    "totalAmount" double precision NOT NULL,
    reference text,
    notes text,
    "batchNumber" text,
    "expiryDate" timestamp(3) without time zone,
    supplier text,
    customer text,
    reason text,
    location text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.stock_transactions OWNER TO cms;

--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.suppliers (
    id text NOT NULL,
    "branchId" text NOT NULL,
    name text NOT NULL,
    "contactPerson" text,
    email text,
    phone text,
    address text,
    city text,
    state text,
    pincode text,
    "gstNumber" text,
    "panNumber" text,
    "bankDetails" text,
    "paymentTerms" text,
    notes text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.suppliers OWNER TO cms;

--
-- Name: users; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.users (
    id text NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    phone text,
    role public."UserRole" NOT NULL,
    status public."UserStatus" DEFAULT 'ACTIVE'::public."UserStatus" NOT NULL,
    "branchId" text NOT NULL,
    "employeeId" text,
    designation text,
    department text,
    "dateOfJoining" timestamp(3) without time zone,
    address text,
    city text,
    state text,
    pincode text,
    "emergencyContact" text,
    "emergencyPhone" text,
    permissions text,
    "resetToken" text,
    "resetTokenExpiry" timestamp(3) without time zone,
    "statusReason" text,
    "isActive" boolean DEFAULT true NOT NULL,
    metadata text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.users OWNER TO cms;

--
-- Name: visits; Type: TABLE; Schema: public; Owner: cms
--

CREATE TABLE public.visits (
    id text NOT NULL,
    "patientId" text NOT NULL,
    "doctorId" text NOT NULL,
    "appointmentId" text,
    vitals text,
    complaints text NOT NULL,
    history text,
    exam text,
    diagnosis text,
    plan text,
    "followUp" timestamp(3) without time zone,
    attachments text,
    "scribeJson" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.visits OWNER TO cms;

--
-- Name: Drug Drug_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public."Drug"
    ADD CONSTRAINT "Drug_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: consents consents_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.consents
    ADD CONSTRAINT consents_pkey PRIMARY KEY (id);


--
-- Name: device_logs device_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.device_logs
    ADD CONSTRAINT device_logs_pkey PRIMARY KEY (id);


--
-- Name: inventory_audits inventory_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.inventory_audits
    ADD CONSTRAINT inventory_audits_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: lab_orders lab_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT lab_orders_pkey PRIMARY KEY (id);


--
-- Name: new_invoice_items new_invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.new_invoice_items
    ADD CONSTRAINT new_invoice_items_pkey PRIMARY KEY (id);


--
-- Name: new_invoices new_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.new_invoices
    ADD CONSTRAINT new_invoices_pkey PRIMARY KEY (id);


--
-- Name: new_payments new_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.new_payments
    ADD CONSTRAINT new_payments_pkey PRIMARY KEY (id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: prescriptions prescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: reorder_rules reorder_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.reorder_rules
    ADD CONSTRAINT reorder_rules_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: stock_adjustments stock_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stock_transactions stock_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.stock_transactions
    ADD CONSTRAINT stock_transactions_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: visits visits_pkey; Type: CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);


--
-- Name: Drug_genericName_idx; Type: INDEX; Schema: public; Owner: cms
--

CREATE INDEX "Drug_genericName_idx" ON public."Drug" USING btree ("genericName");


--
-- Name: Drug_name_idx; Type: INDEX; Schema: public; Owner: cms
--

CREATE INDEX "Drug_name_idx" ON public."Drug" USING btree (name);


--
-- Name: Drug_name_strength_form_key; Type: INDEX; Schema: public; Owner: cms
--

CREATE UNIQUE INDEX "Drug_name_strength_form_key" ON public."Drug" USING btree (name, strength, form);


--
-- Name: inventory_items_barcode_key; Type: INDEX; Schema: public; Owner: cms
--

CREATE UNIQUE INDEX inventory_items_barcode_key ON public.inventory_items USING btree (barcode);


--
-- Name: inventory_items_sku_key; Type: INDEX; Schema: public; Owner: cms
--

CREATE UNIQUE INDEX inventory_items_sku_key ON public.inventory_items USING btree (sku);


--
-- Name: invoices_invoiceNo_key; Type: INDEX; Schema: public; Owner: cms
--

CREATE UNIQUE INDEX "invoices_invoiceNo_key" ON public.invoices USING btree ("invoiceNo");


--
-- Name: new_invoices_invoiceNo_key; Type: INDEX; Schema: public; Owner: cms
--

CREATE UNIQUE INDEX "new_invoices_invoiceNo_key" ON public.new_invoices USING btree ("invoiceNo");


--
-- Name: patients_abhaId_key; Type: INDEX; Schema: public; Owner: cms
--

CREATE UNIQUE INDEX "patients_abhaId_key" ON public.patients USING btree ("abhaId");


--
-- Name: patients_portalUserId_key; Type: INDEX; Schema: public; Owner: cms
--

CREATE UNIQUE INDEX "patients_portalUserId_key" ON public.patients USING btree ("portalUserId");


--
-- Name: prescriptions_visitId_key; Type: INDEX; Schema: public; Owner: cms
--

CREATE UNIQUE INDEX "prescriptions_visitId_key" ON public.prescriptions USING btree ("visitId");


--
-- Name: roles_name_key; Type: INDEX; Schema: public; Owner: cms
--

CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: cms
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: visits_appointmentId_key; Type: INDEX; Schema: public; Owner: cms
--

CREATE UNIQUE INDEX "visits_appointmentId_key" ON public.visits USING btree ("appointmentId");


--
-- Name: appointments appointments_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT "appointments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: appointments appointments_doctorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT "appointments_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: appointments appointments_patientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: appointments appointments_roomId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT "appointments_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES public.rooms(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: consents consents_patientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.consents
    ADD CONSTRAINT "consents_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: consents consents_visitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.consents
    ADD CONSTRAINT "consents_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES public.visits(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: device_logs device_logs_operatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.device_logs
    ADD CONSTRAINT "device_logs_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: device_logs device_logs_patientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.device_logs
    ADD CONSTRAINT "device_logs_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: device_logs device_logs_visitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.device_logs
    ADD CONSTRAINT "device_logs_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES public.visits(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inventory_audits inventory_audits_auditorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.inventory_audits
    ADD CONSTRAINT "inventory_audits_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inventory_audits inventory_audits_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.inventory_audits
    ADD CONSTRAINT "inventory_audits_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public.inventory_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inventory_items inventory_items_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT "inventory_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invoice_items invoice_items_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invoice_items invoice_items_serviceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT "invoice_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES public.services(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invoices invoices_patientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lab_orders lab_orders_patientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT "lab_orders_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lab_orders lab_orders_visitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.lab_orders
    ADD CONSTRAINT "lab_orders_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES public.visits(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: new_invoice_items new_invoice_items_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.new_invoice_items
    ADD CONSTRAINT "new_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.new_invoices(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: new_invoice_items new_invoice_items_serviceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.new_invoice_items
    ADD CONSTRAINT "new_invoice_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES public.services(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: new_invoices new_invoices_appointmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.new_invoices
    ADD CONSTRAINT "new_invoices_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: new_invoices new_invoices_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.new_invoices
    ADD CONSTRAINT "new_invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: new_invoices new_invoices_patientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.new_invoices
    ADD CONSTRAINT "new_invoices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: new_invoices new_invoices_visitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.new_invoices
    ADD CONSTRAINT "new_invoices_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES public.visits(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: new_payments new_payments_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.new_payments
    ADD CONSTRAINT "new_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.new_invoices(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: patients patients_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT "patients_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: patients patients_portalUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT "patients_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payments payments_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: prescriptions prescriptions_visitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT "prescriptions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES public.visits(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "purchase_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "purchase_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: referrals referrals_patientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT "referrals_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: reorder_rules reorder_rules_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.reorder_rules
    ADD CONSTRAINT "reorder_rules_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: reorder_rules reorder_rules_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.reorder_rules
    ADD CONSTRAINT "reorder_rules_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public.inventory_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: reorder_rules reorder_rules_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.reorder_rules
    ADD CONSTRAINT "reorder_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: rooms rooms_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT "rooms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: services services_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT "services_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stock_adjustments stock_adjustments_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT "stock_adjustments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stock_adjustments stock_adjustments_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT "stock_adjustments_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public.inventory_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stock_adjustments stock_adjustments_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT "stock_adjustments_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stock_movements stock_movements_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT "stock_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stock_movements stock_movements_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public.inventory_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stock_movements stock_movements_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT "stock_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stock_transactions stock_transactions_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.stock_transactions
    ADD CONSTRAINT "stock_transactions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public.inventory_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stock_transactions stock_transactions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.stock_transactions
    ADD CONSTRAINT "stock_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: suppliers suppliers_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT "suppliers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: users users_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: visits visits_appointmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT "visits_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: visits visits_doctorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT "visits_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: visits visits_patientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: cms
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT "visits_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: cms
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict 1AuOS1FLnlVC1yGMG6aAkMCWZXdB1t0v3FQja62qlkBO62zqDmSdr1uOI8u9nAV

