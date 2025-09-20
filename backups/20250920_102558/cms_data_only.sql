--
-- PostgreSQL database dump
--

\restrict 3pZLkGk96EUhCMG0HUa01FRFFEJSG27ObldRv5SKNw0vlxTRvzrXrBA8o7V2tJY

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
-- Data for Name: Drug; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public."Drug" (id, name, "genericName", strength, form, route, manufacturer, composition, "brandNames", aliases, "hsnCode", "rxRequired", "isGeneric", metadata, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
a7b54fcd-a103-4594-82c6-56844548df53	6fa1b52bec4cfe9bafc71ea01de97513832bf8a9a1b8ad17b766e5046dfadf11	2025-09-19 17:16:10.029503+00	20250919170122_init_original	\N	\N	2025-09-19 17:16:09.93546+00	1
2a8137fa-7bc6-44ab-bb0c-82ac140d9a2a	6211194448e58833d3fe44c6c04899033c10bd53963b93e2b2eee212b0699223	2025-09-19 17:54:41.316298+00	20250919175416_add_new_invoice_tables	\N	\N	2025-09-19 17:54:41.29949+00	1
02891416-b351-4d15-9017-23b55ce149b2	e2f9c8b445702dd1a2fc367f5a58e61206522bc14a44b74f56a40078136cceb3	2025-09-19 17:57:51.901777+00	20250919175751_add_received_field_to_new_invoice	\N	\N	2025-09-19 17:57:51.899518+00	1
\.


--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.branches (id, name, description, address, city, state, pincode, phone, email, website, "gstNumber", "licenseNumber", "isActive", metadata, "createdAt", "updatedAt") FROM stdin;
branch-seed-1	Main Dermatology Clinic	\N	Hyderabad, Telangana	Hyderabad	Telangana	500001	9000000000	info@dermclinic.com	\N	\N	\N	t	\N	2025-09-19 17:16:17.474	2025-09-19 17:16:17.474
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.users (id, "firstName", "lastName", email, password, phone, role, status, "branchId", "employeeId", designation, department, "dateOfJoining", address, city, state, pincode, "emergencyContact", "emergencyPhone", permissions, "resetToken", "resetTokenExpiry", "statusReason", "isActive", metadata, "createdAt", "updatedAt") FROM stdin;
cmfr3pv6c0001agr0rh4t1hb7	Admin	User	admin@clinic.test	$2b$10$//37fmtgIeJG8NSswG10du.hD.uaYfBYqJapfyhTDIVyKEtmnJZ46	9000000000	ADMIN	ACTIVE	branch-seed-1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N	2025-09-19 17:16:17.556	2025-09-19 17:16:17.556
cmfr3pv6k0003agr0qqy4zo3w	Shravya	Dermatologist	shravya@clinic.test	$2b$10$//37fmtgIeJG8NSswG10du.hD.uaYfBYqJapfyhTDIVyKEtmnJZ46	9000000001	DOCTOR	ACTIVE	branch-seed-1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N	2025-09-19 17:16:17.564	2025-09-19 17:16:17.564
cmfr3pv6m0005agr05i5rmmyl	Praneeta	Jain	praneeta@clinic.test	$2b$10$//37fmtgIeJG8NSswG10du.hD.uaYfBYqJapfyhTDIVyKEtmnJZ46	9000000002	DOCTOR	ACTIVE	branch-seed-1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N	2025-09-19 17:16:17.567	2025-09-19 17:16:17.567
cmfr3pv6o0007agr0laqa5t0w	Riya	Sharma	reception@clinic.test	$2b$10$//37fmtgIeJG8NSswG10du.hD.uaYfBYqJapfyhTDIVyKEtmnJZ46	9000000003	RECEPTION	ACTIVE	branch-seed-1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N	2025-09-19 17:16:17.569	2025-09-19 17:16:17.569
\.


--
-- Data for Name: patients; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.patients (id, "abhaId", name, gender, dob, phone, email, address, city, state, pincode, "emergencyContact", allergies, "photoUrl", "referralSource", "secondaryPhone", "maritalStatus", "bloodGroup", occupation, "guardianName", "medicalHistory", "portalUserId", "branchId", "createdAt", "updatedAt") FROM stdin;
patient-test-1	\N	[TEST] Rajesh Kumar	M	1985-03-15 00:00:00	9876543210	rajesh.kumar@test.com	Banjara Hills, Hyderabad, Telangana 500034	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	branch-seed-1	2025-09-19 17:16:17.589	2025-09-19 17:16:17.589
patient-test-2	\N	[TEST] Priya Sharma	F	1992-07-22 00:00:00	9876543211	priya.sharma@test.com	Jubilee Hills, Hyderabad, Telangana 500033	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	branch-seed-1	2025-09-19 17:16:17.593	2025-09-19 17:16:17.593
patient-test-3	\N	[TEST] Arjun Reddy	M	1988-11-10 00:00:00	9876543212	arjun.reddy@test.com	Gachibowli, Hyderabad, Telangana 500032	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	branch-seed-1	2025-09-19 17:16:17.594	2025-09-19 17:16:17.594
patient-test-4	\N	[TEST] Kavya Patel	F	1995-01-08 00:00:00	9876543213	kavya.patel@test.com	Kondapur, Hyderabad, Telangana 500084	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	branch-seed-1	2025-09-19 17:16:17.6	2025-09-19 17:16:17.6
patient-test-5	\N	[TEST] Vikram Singh	M	1980-09-25 00:00:00	9876543214	vikram.singh@test.com	Madhapur, Hyderabad, Telangana 500081	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	branch-seed-1	2025-09-19 17:16:17.601	2025-09-19 17:16:17.601
patient-test-6	\N	[TEST] Ananya Gupta	F	1990-12-03 00:00:00	9876543215	ananya.gupta@test.com	Hitech City, Hyderabad, Telangana 500081	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	branch-seed-1	2025-09-19 17:16:17.603	2025-09-19 17:16:17.603
patient-test-7	\N	[TEST] Rohit Agarwal	M	1987-06-18 00:00:00	9876543216	rohit.agarwal@test.com	Begumpet, Hyderabad, Telangana 500016	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	branch-seed-1	2025-09-19 17:16:17.605	2025-09-19 17:16:17.605
patient-test-8	\N	[TEST] Deepika Nair	F	1993-04-12 00:00:00	9876543217	deepika.nair@test.com	Kukatpally, Hyderabad, Telangana 500072	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	branch-seed-1	2025-09-19 17:16:17.607	2025-09-19 17:16:17.607
patient-test-9	\N	[TEST] Sanjay Mehta	M	1975-08-30 00:00:00	9876543218	sanjay.mehta@test.com	Secunderabad, Telangana 500003	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	branch-seed-1	2025-09-19 17:16:17.609	2025-09-19 17:16:17.609
patient-test-10	\N	[TEST] Meera Krishnan	F	1991-10-05 00:00:00	9876543219	meera.krishnan@test.com	Miyapur, Hyderabad, Telangana 500049	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	branch-seed-1	2025-09-19 17:16:17.61	2025-09-19 17:16:17.61
\.


--
-- Data for Name: rooms; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.rooms (id, name, type, capacity, "isActive", "branchId", "createdAt", "updatedAt") FROM stdin;
room-consult-1	Consultation Room 1	Consult	3	t	branch-seed-1	2025-09-19 17:16:17.573	2025-09-19 17:16:17.573
room-consult-2	Consultation Room 2	Consult	3	t	branch-seed-1	2025-09-19 17:16:17.577	2025-09-19 17:16:17.577
room-procedure-1	Procedure Room 1	Procedure	2	t	branch-seed-1	2025-09-19 17:16:17.579	2025-09-19 17:16:17.579
room-procedure-2	Procedure Room 2	Procedure	2	t	branch-seed-1	2025-09-19 17:16:17.581	2025-09-19 17:16:17.581
room-procedure-3	Procedure Room 3	Procedure	2	t	branch-seed-1	2025-09-19 17:16:17.583	2025-09-19 17:16:17.583
room-telemedicine-1	Telemedicine Suite	Telemed	1	t	branch-seed-1	2025-09-19 17:16:17.585	2025-09-19 17:16:17.585
\.


--
-- Data for Name: appointments; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.appointments (id, "patientId", "doctorId", date, slot, status, "visitType", notes, source, "branchId", "roomId", "tokenNumber", "createdAt", "updatedAt") FROM stdin;
cmfr3xxyj001kagr867h3z8xu	patient-test-9	cmfr3pv6m0005agr05i5rmmyl	2025-09-20 00:00:00	11:30-12:00	SCHEDULED	OPD	\N	\N	branch-seed-1	\N	1	2025-09-19 17:22:34.412	2025-09-19 17:22:34.412
cmfr3yis5001magr851yvi0et	patient-test-10	cmfr3pv6m0005agr05i5rmmyl	2025-09-20 00:00:00	12:00-12:30	SCHEDULED	OPD	\N	\N	branch-seed-1	\N	2	2025-09-19 17:23:01.398	2025-09-19 17:23:01.398
cmfr45eez001oagr8g8g6pxwr	patient-test-9	cmfr3pv6m0005agr05i5rmmyl	2025-09-20 00:00:00	12:30-13:00	SCHEDULED	OPD	\N	\N	branch-seed-1	room-consult-2	3	2025-09-19 17:28:22.331	2025-09-19 17:28:22.331
cmfr68tdp000dag18adnhbapf	patient-test-2	cmfr3pv6m0005agr05i5rmmyl	2025-09-20 00:00:00	13:00-13:30	SCHEDULED	OPD	\N	\N	branch-seed-1	room-consult-2	4	2025-09-19 18:27:00.925	2025-09-19 18:27:00.925
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.audit_logs (id, "userId", action, entity, "entityId", "oldValues", "newValues", "ipAddress", "userAgent", "timestamp") FROM stdin;
\.


--
-- Data for Name: visits; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.visits (id, "patientId", "doctorId", "appointmentId", vitals, complaints, history, exam, diagnosis, plan, "followUp", attachments, "scribeJson", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: consents; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.consents (id, "patientId", "visitId", "consentType", language, text, "signedAt", signer, method, "pdfUrl", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: device_logs; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.device_logs (id, "patientId", "visitId", "deviceModel", "serialNo", parameters, "operatorId", "photoRefs", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: inventory_items; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.inventory_items (id, "branchId", name, description, "genericName", "brandName", type, category, "subCategory", manufacturer, supplier, barcode, sku, "costPrice", "sellingPrice", mrp, unit, "packSize", "packUnit", "currentStock", "minStockLevel", "maxStockLevel", "reorderLevel", "reorderQuantity", "expiryDate", "batchNumber", "hsnCode", "gstRate", "requiresPrescription", "isControlled", "storageLocation", "storageConditions", tags, status, "stockStatus", metadata, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: inventory_audits; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.inventory_audits (id, "branchId", "itemId", "auditorId", "auditDate", "physicalStock", "systemStock", variance, notes, status, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.invoices (id, "patientId", "visitId", mode, "gstBreakup", "exemptBreakup", total, received, balance, "invoiceNo", gstin, hsn, "createdAt", "updatedAt") FROM stdin;
cmfr3vn30000fagr8x5er55l9	patient-test-10	\N	CASH	\N	\N	590	590	0	INV-20250527-001	\N	\N	2025-05-27 03:42:55.28	2025-09-19 17:20:47.017
cmfr3vn3g000lagr8p5zyh202	patient-test-10	\N	CASH	\N	\N	5310	5310	0	INV-20250728-001	\N	\N	2025-07-28 14:21:57.518	2025-09-19 17:20:47.027
cmfr3vn3o000sagr8kywa10uv	patient-test-9	\N	CASH	\N	\N	9440	9440	0	INV-20250901-001	\N	\N	2025-09-01 14:08:13.489	2025-09-19 17:20:47.032
cmfr3vn3t000yagr8lela0zkz	patient-test-8	\N	CASH	\N	\N	2950	0	2950	INV-20250620-001	\N	\N	2025-06-20 12:28:01.774	2025-09-19 17:20:47.033
cmfr3vn3x0012agr8vcoecb7u	patient-test-8	\N	CASH	\N	\N	6490	0	6490	INV-20250622-001	\N	\N	2025-06-22 13:02:04.552	2025-09-19 17:20:47.037
cmfr3vn400017agr88d1wh159	patient-test-7	\N	CASH	\N	\N	9440	9440	0	INV-20250522-001	\N	\N	2025-05-22 04:10:58.809	2025-09-19 17:20:47.044
cmfr3vn45001dagr81q3s2po7	patient-test-6	\N	CASH	\N	\N	16520	16520	0	INV-20250909-001	\N	\N	2025-09-09 11:49:47.02	2025-09-19 17:20:47.048
\.


--
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.services (id, name, type, taxable, "gstRate", "priceMrp", "priceNet", "deviceId", "branchId", "createdAt", "updatedAt") FROM stdin;
cmfr3pv7y0009agr052v6wtja	Dermatology Consultation	Consult	f	0	800	800	\N	branch-seed-1	2025-09-19 17:16:17.614	2025-09-19 17:16:17.614
cmfr3pv81000bagr0hmfkgs39	Acne Treatment	Consult	t	18	1500	1500	\N	branch-seed-1	2025-09-19 17:16:17.618	2025-09-19 17:16:17.618
cmfr3pv82000dagr0j8zmhril	Skin Analysis	Consult	t	18	1000	1000	\N	branch-seed-1	2025-09-19 17:16:17.619	2025-09-19 17:16:17.619
cmfr3vn2c0003agr88pmrxlxb	Acne Treatment Package (4 sessions)	Package	t	18	8000	8000	\N	branch-seed-1	2025-09-19 17:20:46.98	2025-09-19 17:20:46.98
cmfr3vn2n0005agr87csib10f	Chemical Peel	Procedure	t	18	2500	2500	\N	branch-seed-1	2025-09-19 17:20:46.992	2025-09-19 17:20:46.992
cmfr3vn2p0007agr8pzlsgqmh	Laser Hair Removal - Underarms (1 session)	Aesthetic	t	18	1500	1500	\N	branch-seed-1	2025-09-19 17:20:46.994	2025-09-19 17:20:46.994
cmfr3vn2r0009agr8sozvukkp	PRP Therapy - Scalp	Procedure	t	18	6000	6000	\N	branch-seed-1	2025-09-19 17:20:46.996	2025-09-19 17:20:46.996
cmfr3vn2t000bagr8a9b1deo7	Skin Glow Facial	Aesthetic	t	18	2000	2000	\N	branch-seed-1	2025-09-19 17:20:46.998	2025-09-19 17:20:46.998
cmfr3vn2v000dagr8omtvpl5o	Wart Removal	Procedure	t	18	3000	3000	\N	branch-seed-1	2025-09-19 17:20:47	2025-09-19 17:20:47
cmfr4s9k2001qagr8zu4gny42	HydraFacial	Consult	t	18	4500	4500	\N	branch-seed-1	2025-09-19 17:46:09.122	2025-09-19 17:46:09.122
cmfr4s9kg001sagr86a7ktpcf	Medical Facial	Consult	t	18	2500	2500	\N	branch-seed-1	2025-09-19 17:46:09.136	2025-09-19 17:46:09.136
cmfr4uwlp001wagr80rcklfh0	Skin Analysis & Consultation	Consult	t	18	1000	1000	\N	branch-seed-1	2025-09-19 17:48:12.302	2025-09-19 17:48:12.302
cmfr4uwlx001yagr8py2r5dp9	PRP Therapy (3 sessions)	Consult	t	18	9000	9000	\N	branch-seed-1	2025-09-19 17:48:12.309	2025-09-19 17:48:12.309
cmfr4uwm00020agr8hhbyp24r	Chemical Peel (2 sessions)	Consult	t	18	4000	4000	\N	branch-seed-1	2025-09-19 17:48:12.312	2025-09-19 17:48:12.312
cmfr4uwm30022agr8596kknop	Premium Skincare Kit	Consult	t	18	1000	1000	\N	branch-seed-1	2025-09-19 17:48:12.316	2025-09-19 17:48:12.316
cmfr5cb330026agr8k88qnn1s	Skin Analysis & Consultation	Consult	t	18	1000	1000	\N	branch-seed-1	2025-09-19 18:01:44.223	2025-09-19 18:01:44.223
cmfr5cb3g0028agr8sb86t8rc	PRP Therapy (3 sessions)	Consult	t	18	9000	9000	\N	branch-seed-1	2025-09-19 18:01:44.236	2025-09-19 18:01:44.236
cmfr5cb3i002aagr8u8d2aw1e	Chemical Peel (2 sessions)	Consult	t	18	4000	4000	\N	branch-seed-1	2025-09-19 18:01:44.239	2025-09-19 18:01:44.239
cmfr5cb3k002cagr8blay3myp	Premium Skincare Kit	Consult	t	18	1000	1000	\N	branch-seed-1	2025-09-19 18:01:44.241	2025-09-19 18:01:44.241
cmfr5cltm002gagr80zp1dz5v	Pigmentation Analysis	Consult	t	18	800	800	\N	branch-seed-1	2025-09-19 18:01:58.139	2025-09-19 18:01:58.139
cmfr5cltp002iagr8seu8hi1v	Laser Pigmentation Treatment (3x)	Consult	t	18	7500	7500	\N	branch-seed-1	2025-09-19 18:01:58.142	2025-09-19 18:01:58.142
cmfr5clts002kagr884qdd27s	Lightening Peel	Consult	t	18	1200	1200	\N	branch-seed-1	2025-09-19 18:01:58.144	2025-09-19 18:01:58.144
cmfr5cltv002magr8g9fann5z	Maintenance Products	Consult	t	18	500	500	\N	branch-seed-1	2025-09-19 18:01:58.147	2025-09-19 18:01:58.147
cmfr5ct760001ag322xrhs615	Test Consultation	Consult	t	18	500	500	\N	branch-seed-1	2025-09-19 18:02:07.698	2025-09-19 18:02:07.698
cmfr5k5ag002qagr8fhvm781p	Follow-up Consultation	Consult	t	18	600	600	\N	branch-seed-1	2025-09-19 18:07:49.961	2025-09-19 18:07:49.961
cmfr5k5aw002sagr8s0j29vfs	Skin Analysis & Consultation	Consult	t	18	1000	1000	\N	branch-seed-1	2025-09-19 18:07:49.977	2025-09-19 18:07:49.977
cmfr5k5az002uagr8daaz7hfi	PRP Therapy (3 sessions)	Consult	t	18	9000	9000	\N	branch-seed-1	2025-09-19 18:07:49.979	2025-09-19 18:07:49.979
cmfr5k5b1002wagr8l4xhj272	Chemical Peel (2 sessions)	Consult	t	18	4000	4000	\N	branch-seed-1	2025-09-19 18:07:49.981	2025-09-19 18:07:49.981
cmfr5k5b2002yagr8swak1f9u	Premium Skincare Kit	Consult	t	18	1000	1000	\N	branch-seed-1	2025-09-19 18:07:49.983	2025-09-19 18:07:49.983
cmfr5n4p30032agr8snbtbj34	Skin Analysis & Consultation	Consult	t	18	1000	1000	\N	branch-seed-1	2025-09-19 18:10:09.16	2025-09-19 18:10:09.16
cmfr5n4pe0034agr8dra8z97h	PRP Therapy (3 sessions)	Consult	t	18	9000	9000	\N	branch-seed-1	2025-09-19 18:10:09.17	2025-09-19 18:10:09.17
cmfr5n4ph0036agr8mppbi3zd	Chemical Peel (2 sessions)	Consult	t	18	4000	4000	\N	branch-seed-1	2025-09-19 18:10:09.173	2025-09-19 18:10:09.173
cmfr5n4pj0038agr8rprqu0ga	Premium Skincare Kit	Consult	t	18	1000	1000	\N	branch-seed-1	2025-09-19 18:10:09.175	2025-09-19 18:10:09.175
cmfr5qw7g003cagr8qh5cyd93	Initial Consultation	Consult	t	18	800	800	\N	branch-seed-1	2025-09-19 18:13:04.779	2025-09-19 18:13:04.779
cmfr5qw7r003eagr8s2q1yjh3	Acne Treatment Session (4x)	Consult	t	18	6000	6000	\N	branch-seed-1	2025-09-19 18:13:04.791	2025-09-19 18:13:04.791
cmfr5qw7t003gagr85hrxd1s3	Follow-up Consultation	Consult	t	18	600	600	\N	branch-seed-1	2025-09-19 18:13:04.793	2025-09-19 18:13:04.793
cmfr5qw7v003iagr8ctrijjuu	Skincare Kit	Consult	t	18	600	600	\N	branch-seed-1	2025-09-19 18:13:04.795	2025-09-19 18:13:04.795
cmfr5vofb0001agp71vz0kq56	Initial Consultation	Consult	t	18	800	800	\N	branch-seed-1	2025-09-19 18:16:47.975	2025-09-19 18:16:47.975
cmfr5vofn0003agp79z2ga6qp	Acne Treatment Session (4x)	Consult	t	18	6000	6000	\N	branch-seed-1	2025-09-19 18:16:47.988	2025-09-19 18:16:47.988
cmfr5vofp0005agp71rs87637	Follow-up Consultation	Consult	t	18	600	600	\N	branch-seed-1	2025-09-19 18:16:47.99	2025-09-19 18:16:47.99
cmfr5vofs0007agp76tzfci9j	Skincare Kit	Consult	t	18	600	600	\N	branch-seed-1	2025-09-19 18:16:47.992	2025-09-19 18:16:47.992
cmfr5wwkn000gagp7ugy8msm6	Consultation & Patch Test	Consult	t	18	500	500	\N	branch-seed-1	2025-09-19 18:17:45.191	2025-09-19 18:17:45.191
cmfr5wwkw000iagp7ylec44lo	Laser Sessions (6x)	Consult	t	18	10500	10500	\N	branch-seed-1	2025-09-19 18:17:45.2	2025-09-19 18:17:45.2
cmfr5wwky000kagp76p2n1j7s	Post-care Products	Consult	t	18	1000	1000	\N	branch-seed-1	2025-09-19 18:17:45.202	2025-09-19 18:17:45.202
cmfr66w1m0001ag18oxusarv2	Consultation & Patch Test	Consult	t	5	500	500	\N	branch-seed-1	2025-09-19 18:25:31.066	2025-09-19 18:25:31.066
cmfr66w1w0003ag18y15kfppg	Laser Sessions (6x)	Consult	f	0	10500	10500	\N	branch-seed-1	2025-09-19 18:25:31.076	2025-09-19 18:25:31.076
cmfr66w1y0005ag189zmt2g20	Peel	Consult	t	18	1000	1000	\N	branch-seed-1	2025-09-19 18:25:31.079	2025-09-19 18:25:31.079
\.


--
-- Data for Name: invoice_items; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.invoice_items (id, "invoiceId", "serviceId", qty, "unitPrice", "gstRate", total) FROM stdin;
cmfr3vn30000hagr82a2s43m8	cmfr3vn30000fagr8x5er55l9	cmfr3pv7y0009agr052v6wtja	1	500	0	500
cmfr3vn3h000nagr8vy6co103	cmfr3vn3g000lagr8p5zyh202	cmfr3vn2n0005agr87csib10f	1	2500	18	2500
cmfr3vn3h000oagr8jbn96zqw	cmfr3vn3g000lagr8p5zyh202	cmfr3vn2t000bagr8a9b1deo7	1	2000	18	2000
cmfr3vn3o000uagr81qau2nv2	cmfr3vn3o000sagr8kywa10uv	cmfr3vn2c0003agr88pmrxlxb	1	8000	18	8000
cmfr3vn3t0010agr8lbwpohd0	cmfr3vn3t000yagr8lela0zkz	cmfr3vn2n0005agr87csib10f	1	2500	18	2500
cmfr3vn3x0014agr834rqztmc	cmfr3vn3x0012agr8vcoecb7u	cmfr3vn2v000dagr8omtvpl5o	1	3000	18	3000
cmfr3vn3x0015agr87e6rqgjk	cmfr3vn3x0012agr8vcoecb7u	cmfr3vn2n0005agr87csib10f	1	2500	18	2500
cmfr3vn400019agr8cdhe3mts	cmfr3vn400017agr88d1wh159	cmfr3vn2c0003agr88pmrxlxb	1	8000	18	8000
cmfr3vn45001fagr8yztgbid9	cmfr3vn45001dagr81q3s2po7	cmfr3vn2r0009agr8sozvukkp	1	6000	18	6000
cmfr3vn45001gagr8b6fwggxc	cmfr3vn45001dagr81q3s2po7	cmfr3vn2c0003agr88pmrxlxb	1	8000	18	8000
\.


--
-- Data for Name: lab_orders; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.lab_orders (id, "patientId", "visitId", tests, partner, status, "resultsRef", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: new_invoices; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.new_invoices (id, "invoiceNo", "patientId", "visitId", "appointmentId", "branchId", total, balance, discount, "discountReason", notes, "dueDate", metadata, mode, gstin, hsn, status, "createdAt", "updatedAt", received) FROM stdin;
cmfr5vofu0009agp72ik8ec3c	INV-20250919-001	patient-test-10	\N	\N	branch-seed-1	9440	9440	0	\N	\N	\N	\N	\N	\N	\N	DRAFT	2025-09-19 18:16:47.995	2025-09-19 18:16:47.995	0
cmfr5wwl2000magp7uerepw2v	INV-20250919-002	patient-test-10	\N	\N	branch-seed-1	14160	14160	0	\N	\N	\N	\N	\N	\N	\N	DRAFT	2025-09-19 18:17:45.206	2025-09-19 18:17:45.206	0
cmfr66w220007ag18cigobqfh	INV-20250919-003	patient-test-10	\N	\N	branch-seed-1	14095	14095	0	\N	\N	\N	\N	\N	\N	\N	DRAFT	2025-09-19 18:25:31.083	2025-09-19 18:25:31.083	0
\.


--
-- Data for Name: new_invoice_items; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.new_invoice_items (id, "invoiceId", "serviceId", name, description, qty, "unitPrice", discount, "gstRate", total, "createdAt", "updatedAt") FROM stdin;
cmfr5vofu000bagp74mebzn0s	cmfr5vofu0009agp72ik8ec3c	cmfr5vofb0001agp71vz0kq56	Initial Consultation	Part of Complete Acne Treatment Package	1	800	0	18	800	2025-09-19 18:16:47.995	2025-09-19 18:16:47.995
cmfr5vofu000cagp7ckbmy3he	cmfr5vofu0009agp72ik8ec3c	cmfr5vofn0003agp79z2ga6qp	Acne Treatment Session (4x)	Part of Complete Acne Treatment Package	1	6000	0	18	6000	2025-09-19 18:16:47.995	2025-09-19 18:16:47.995
cmfr5vofu000dagp77sog0bl8	cmfr5vofu0009agp72ik8ec3c	cmfr5vofp0005agp71rs87637	Follow-up Consultation	Part of Complete Acne Treatment Package	1	600	0	18	600	2025-09-19 18:16:47.995	2025-09-19 18:16:47.995
cmfr5vofu000eagp7esk5dwfb	cmfr5vofu0009agp72ik8ec3c	cmfr5vofs0007agp76tzfci9j	Skincare Kit	Part of Complete Acne Treatment Package	1	600	0	18	600	2025-09-19 18:16:47.995	2025-09-19 18:16:47.995
cmfr5wwl2000oagp7qoccfp51	cmfr5wwl2000magp7uerepw2v	cmfr5wwkn000gagp7ugy8msm6	Consultation & Patch Test	Part of Laser Hair Removal - Full Package	1	500	0	18	500	2025-09-19 18:17:45.206	2025-09-19 18:17:45.206
cmfr5wwl2000pagp78k48mpjz	cmfr5wwl2000magp7uerepw2v	cmfr5wwkw000iagp7ylec44lo	Laser Sessions (6x)	Part of Laser Hair Removal - Full Package	1	10500	0	18	10500	2025-09-19 18:17:45.206	2025-09-19 18:17:45.206
cmfr5wwl2000qagp7bnpeiuje	cmfr5wwl2000magp7uerepw2v	cmfr5wwky000kagp76p2n1j7s	Post-care Products	Part of Laser Hair Removal - Full Package	1	1000	0	18	1000	2025-09-19 18:17:45.206	2025-09-19 18:17:45.206
cmfr66w230009ag189kdttvlw	cmfr66w220007ag18cigobqfh	cmfr66w1m0001ag18oxusarv2	Consultation & Patch Test	Part of Laser Hair Removal - Full Package	1	500	0	5	500	2025-09-19 18:25:31.083	2025-09-19 18:25:31.083
cmfr66w23000aag1889sf8o6g	cmfr66w220007ag18cigobqfh	cmfr66w1w0003ag18y15kfppg	Laser Sessions (6x)	Part of Laser Hair Removal - Full Package	1	10500	0	0	10500	2025-09-19 18:25:31.083	2025-09-19 18:25:31.083
cmfr66w23000bag18fmbowny0	cmfr66w220007ag18cigobqfh	cmfr66w1y0005ag189zmt2g20	Peel	Part of Laser Hair Removal - Full Package	1	1000	0	18	1000	2025-09-19 18:25:31.083	2025-09-19 18:25:31.083
\.


--
-- Data for Name: new_payments; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.new_payments (id, "invoiceId", amount, mode, reference, gateway, "reconStatus", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.payments (id, "invoiceId", amount, mode, reference, gateway, "reconStatus", "createdAt", "updatedAt") FROM stdin;
cmfr3vn3a000jagr8bhmi690l	cmfr3vn30000fagr8x5er55l9	590	CASH	SAMPLE	\N	COMPLETED	2025-06-02 03:42:55.28	2025-09-19 17:20:47.014
cmfr3vn3l000qagr853i2uxbh	cmfr3vn3g000lagr8p5zyh202	5310	CASH	SAMPLE	\N	COMPLETED	2025-07-29 14:21:57.518	2025-09-19 17:20:47.026
cmfr3vn3r000wagr8e3ucb8jf	cmfr3vn3o000sagr8kywa10uv	9440	CASH	SAMPLE	\N	COMPLETED	2025-09-06 14:08:13.489	2025-09-19 17:20:47.032
cmfr3vn43001bagr8nztzpukr	cmfr3vn400017agr88d1wh159	9440	CASH	SAMPLE	\N	COMPLETED	2025-05-29 04:10:58.809	2025-09-19 17:20:47.043
cmfr3vn47001iagr8ko3nkjpu	cmfr3vn45001dagr81q3s2po7	16520	CASH	SAMPLE	\N	COMPLETED	2025-09-12 11:49:47.02	2025-09-19 17:20:47.048
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.permissions (id, name, description, resource, action, "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: prescriptions; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.prescriptions (id, "visitId", language, items, instructions, "genericFirst", "pharmacistNotes", qrcode, signature, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.purchase_orders (id, "branchId", "userId", supplier, "orderDate", "expectedDeliveryDate", status, items, "totalAmount", notes, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: referrals; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.referrals (id, "patientId", source, "commissionScheme", "payoutStatus", amount, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: reorder_rules; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.reorder_rules (id, "branchId", "itemId", "userId", "reorderLevel", "reorderQuantity", "isActive", metadata, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.roles (id, name, description, permissions, "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: stock_adjustments; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.stock_adjustments (id, "branchId", "itemId", "userId", type, quantity, reason, notes, metadata, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.stock_movements (id, "branchId", "itemId", "userId", type, quantity, "fromLocation", "toLocation", reason, notes, metadata, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: stock_transactions; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.stock_transactions (id, "branchId", "itemId", "userId", type, quantity, "unitPrice", "totalAmount", reference, notes, "batchNumber", "expiryDate", supplier, customer, reason, location, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: cms
--

COPY public.suppliers (id, "branchId", name, "contactPerson", email, phone, address, city, state, pincode, "gstNumber", "panNumber", "bankDetails", "paymentTerms", notes, "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- PostgreSQL database dump complete
--

\unrestrict 3pZLkGk96EUhCMG0HUa01FRFFEJSG27ObldRv5SKNw0vlxTRvzrXrBA8o7V2tJY

