# Stage 7Y.4 ? Local expected RPC/helper declarations

Source extraction, not SQL execution or verified cloud definitions. Last declaration in numbered-file order is shown; 068 is proposed, not installed. Compare named argument keys in the actual frontend callers too. Return clauses can include attributes preceding LANGUAGE. JSONB object keys require source review beyond SQL return types.

| Name | Local source | Arguments (including defaults) | Return clause |
|---|---|---|---|
| `activate_community_credit_policy` | `060_community_credit_enrollment.sql` | `p_id uuid` | `jsonb` |
| `add_tanod_member` | `044_incident_blotter_tanod.sql` | `p_full_name text, p_area_note text DEFAULT NULL, p_display_order integer DEFAULT 0` | `uuid` |
| `amend_blotter_entry` | `044_incident_blotter_tanod.sql` | `p_incident_id uuid, p_note text` | `void` |
| `assign_kp_panel_member` | `043_kp_case_hearings_summons.sql` | `p_case_id uuid, p_member_name text, p_panel_role text default 'member'` | `uuid` |
| `attribute_incident_tanod` | `044_incident_blotter_tanod.sql` | `p_incident_id uuid, p_tanod_id uuid, p_role text, p_note text DEFAULT NULL` | `void` |
| `barangay_resident_directory` | `054_barangay_resident_directory.sql` | `` | `setof public.barangay_residents` |
| `blotter_history_for` | `044_incident_blotter_tanod.sql` | `p_incident_id uuid` | `table (id uuid, action text, note text, actor_name text, created_at timestamptz)` |
| `case_support_history` | `050_case_evidence_support.sql` | `p_complaint_id uuid` | `table(id uuid,event_kind text,detail jsonb,created_at timestamptz)` |
| `clearance_case_warning` | `051_case_review_support.sql` | `p_request_id uuid` | `boolean` |
| `community_credit_admin_state` | `059_community_credit_foundation.sql` | `` | `jsonb` |
| `community_credit_enroll_active_residents` | `060_community_credit_enrollment.sql` | `p_policy_id uuid` | `jsonb` |
| `community_credit_enroll_on_active_resident` | `060_community_credit_enrollment.sql` | `` | `trigger` |
| `community_credit_guard_event` | `060_community_credit_enrollment.sql` | `` | `trigger` |
| `community_credit_profile` | `060_community_credit_enrollment.sql` | `p_resident_id uuid` | `jsonb` |
| `community_credit_resident_directory` | `059_community_credit_foundation.sql` | `` | `table(id uuid,first_name text,middle_name text,last_name text,suffix text,purok text,resident_status text,account_linked boolean)` |
| `complaint_attachments_for` | `050_case_evidence_support.sql` | `p_complaint_id uuid` | `table(id uuid,object_path text,display_filename text,media_kind text,mime_type text,byte_size bigint,uploaded_at timestamptz)` |
| `complaint_history_for` | `040_complaint_intake_foundation.sql` | `p_complaint_id uuid` | `table ( id uuid, from_status text, to_status text, note text, created_at timestamptz )` |
| `complaint_parties_for` | `040_complaint_intake_foundation.sql` | `p_complaint_id uuid` | `table ( id uuid, party_role text, full_name_snapshot text, contact_number_snapshot text, address_note text, has_profile_link boolean, has_registry_link boolean, created_at timestamptz )` |
| `complaint_queue` | `040_complaint_intake_foundation.sql` | `` | `table ( id uuid, reference text, intake_channel text, status text, created_at timestamptz, updated_at timestamptz )` |
| `complaint_screenings_for` | `042_kp_screening_foundation.sql` | `p_complaint_id uuid` | `table ( id uuid, checklist_version text, answers jsonb, recommendation text, recommendation_note text, prepared_by_name text, prepared_at timestamptz, confirmed_outcome text, confirmed_by_name text, confirmed_at timestamptz, confirmation_note text, is_open boolean )` |
| `compose_full_name` | `012_pin_compose_search_path.sql` | `` | `trigger` |
| `conclude_kp_case` | `046_kp_conclude_case.sql` | `p_case_id uuid, p_note text default null` | `uuid` |
| `confirm_complaint_screening` | `042_kp_screening_foundation.sql` | `p_screening_id uuid, p_outcome text, p_note text default null` | `uuid` |
| `current_official_holds_position` | `031_official_authorization_cutover.sql` | `p_position text` | `boolean` |
| `current_official_is_active` | `044_incident_blotter_tanod.sql` | `` | `boolean` |
| `current_official_may_administer_records` | `044_incident_blotter_tanod.sql` | `` | `boolean` |
| `current_tanod_member_id` | `052_tanod_accounts_and_duty.sql` | `` | `uuid` |
| `encode_walk_in_complaint` | `040_complaint_intake_foundation.sql` | `p_complainant_name text, p_complainant_contact text, p_category text, p_narrative text, p_location_note text, p_respondents jsonb` | `text` |
| `file_complaint_as_resident` | `040_complaint_intake_foundation.sql` | `p_category text, p_narrative text, p_location_note text, p_respondents jsonb` | `text` |
| `handle_new_resident_signup` | `011_split_resident_names.sql` | `` | `trigger` |
| `incident_counts_by_status` | `044_incident_blotter_tanod.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL` | `table (status text, total integer)` |
| `incident_counts_by_type` | `044_incident_blotter_tanod.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL` | `table (incident_type text, total integer)` |
| `incident_detail` | `044_incident_blotter_tanod.sql` | `p_incident_id uuid` | `table ( id uuid, reference text, incident_type text, occurred_at timestamptz, narrative text, location_text text, area_note text, latitude numeric, longitude numeric, status text, source text, blotter_reference text, blotter_summary text, blotter_recorded_at timestamptz, recorded_by_name text, created_at timestamptz, updated_at timestamptz)` |
| `incident_kp_link` | `051_case_review_support.sql` | `p_incident_id uuid` | `table(case_id uuid,reference text,status text)` |
| `incident_location_frequency` | `048_location_type_ties.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL` | `table (location_key text, location_label text, total integer, with_coordinates integer, centroid_latitude numeric, centroid_longitude numeric, top_type text)` |
| `incident_map_points` | `044_incident_blotter_tanod.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_type text DEFAULT NULL` | `table (id uuid, reference text, incident_type text, occurred_at timestamptz, latitude numeric, longitude numeric, location_text text, status text)` |
| `incident_monthly_trend` | `044_incident_blotter_tanod.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL` | `table (month_key text, total integer)` |
| `incident_queue` | `044_incident_blotter_tanod.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_type text DEFAULT NULL` | `table ( id uuid, reference text, incident_type text, occurred_at timestamptz, location_text text, area_note text, status text, source text, has_coordinates boolean, blotter_reference text, recorded_by_name text, tanod_count integer, created_at timestamptz)` |
| `incident_tanod_for` | `044_incident_blotter_tanod.sql` | `p_incident_id uuid` | `table (id uuid, tanod_id uuid, tanod_name text, role text, note text, created_at timestamptz)` |
| `is_official` | `BASELINE/UNRESOLVED` | `Inspect effective baseline` | `Not extracted` |
| `kp_case_for_complaint` | `043_kp_case_hearings_summons.sql` | `p_complaint_id uuid` | `table ( id uuid, reference text, complaint_id uuid, complaint_reference text, screening_id uuid, status text, opened_by_name text, opened_at timestamptz, opening_note text, concluded_by_name text, concluded_at timestamptz, conclusion_note text )` |
| `kp_case_panel_for` | `043_kp_case_hearings_summons.sql` | `p_case_id uuid` | `table ( id uuid, member_name text, panel_role text, assigned_by_name text, assigned_at timestamptz )` |
| `kp_case_parties_for` | `043_kp_case_hearings_summons.sql` | `p_case_id uuid` | `table ( party_id uuid, party_role text, party_name text )` |
| `kp_followups_for` | `051_case_review_support.sql` | `p_case_id uuid` | `setof public.kp_case_followups` |
| `kp_hearing_attendance_for` | `043_kp_case_hearings_summons.sql` | `p_hearing_id uuid` | `table ( id uuid, party_id uuid, party_role text, party_name text, attendance text, attendance_note text, recorded_by_name text, recorded_at timestamptz )` |
| `kp_hearings_for` | `043_kp_case_hearings_summons.sql` | `p_case_id uuid` | `table ( id uuid, proceeding_type text, hearing_date date, start_time time without time zone, location text, status text, presiding_note text, admin_notes text, minutes text, outcome text, outcome_note text, outcome_recorded_by_name text, outcome_recorded_at timestamptz, scheduled_by_name text, scheduled_at timestamptz )` |
| `link_complaint_party` | `051_case_review_support.sql` | `p_party_id uuid,p_record_kind text,p_record_id uuid` | `void` |
| `link_incident_kp` | `051_case_review_support.sql` | `p_incident_id uuid,p_case_reference text` | `void` |
| `my_community_credit_profile` | `059_community_credit_foundation.sql` | `` | `jsonb` |
| `notify_verification` | `022_in_app_notifications.sql` | `` | `trigger` |
| `official_id_for_current_user` | `031_official_authorization_cutover.sql` | `` | `uuid` |
| `official_tanod_followups` | `053_tanod_incident_access.sql` | `p_incident_id uuid` | `table(id uuid,tanod_name text,note text,created_at timestamptz)` |
| `open_kp_case` | `043_kp_case_hearings_summons.sql` | `p_complaint_id uuid, p_note text default null` | `text` |
| `prepare_complaint_screening` | `042_kp_screening_foundation.sql` | `p_complaint_id uuid, p_checklist_version text, p_answers jsonb, p_recommendation text default null, p_recommendation_note text default null` | `uuid` |
| `prevent_role_self_change` | `068_resident_verification_security.sql` | `` | `trigger` |
| `protect_document_request_status` | `003_lock_resident_row_edits.sql` | `` | `trigger` |
| `public_safety_monthly` | `045_public_safety_aggregates.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL` | `table (month_key text, total integer)` |
| `public_safety_overview` | `045_public_safety_aggregates.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL` | `table (total_incidents integer, mapped_incidents integer, zone_count integer)` |
| `public_safety_type_counts` | `045_public_safety_aggregates.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL` | `table (incident_type text, total integer)` |
| `public_safety_zone_type_counts` | `049_public_zone_type_counts.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL` | `table (zone_key text, incident_type text, total integer)` |
| `public_safety_zones` | `045_public_safety_aggregates.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL` | `table (zone_key text, center_latitude numeric, center_longitude numeric, total integer)` |
| `public_tanod_on_duty` | `052_tanod_accounts_and_duty.sql` | `` | `table(display_name text,general_area text,shift_start timestamptz,shift_end timestamptz,duty_state text)` |
| `record_complaint_attachment` | `050_case_evidence_support.sql` | `p_complaint_id uuid, p_object_path text, p_display_filename text, p_mime_type text, p_byte_size bigint` | `uuid` |
| `record_incident` | `053_tanod_incident_access.sql` | `p_incident_type text, p_occurred_at timestamptz, p_narrative text, p_location_text text, p_source text DEFAULT 'official_report', p_latitude numeric DEFAULT NULL, p_longitude numeric DEFAULT NULL, p_area_note text DEFAULT NULL, p_tanod_id uuid DEFAULT NULL, p_tanod_role text DEFAULT NULL` | `text` |
| `record_kp_attendance` | `043_kp_case_hearings_summons.sql` | `p_hearing_id uuid, p_party_id uuid, p_attendance text, p_note text default null` | `uuid` |
| `record_kp_hearing_outcome` | `043_kp_case_hearings_summons.sql` | `p_hearing_id uuid, p_outcome text, p_note text default null, p_concludes_case boolean default false` | `uuid` |
| `retire_community_credit_policy` | `059_community_credit_foundation.sql` | `p_id uuid` | `void` |
| `save_barangay_resident` | `056_resident_eligibility.sql` | `p_id uuid,p_first_name text,p_middle_name text,p_last_name text, p_suffix text,p_birth_date date,p_mobile_number text,p_purok text,p_resident_status text` | `uuid` |
| `save_community_credit_policy` | `060_community_credit_enrollment.sql` | `p_id uuid,p_name text,p_description text,p_base_score integer,p_minimum_score integer,p_maximum_score integer` | `uuid` |
| `save_community_credit_rule` | `059_community_credit_foundation.sql` | `p_id uuid,p_policy_id uuid,p_rule_code text,p_title text,p_description text,p_category text,p_source_domain text,p_points_delta integer,p_repairable boolean` | `uuid` |
| `save_kp_followups` | `051_case_review_support.sql` | `p_case_id uuid,p_mediation_due date,p_conciliation_due date, p_repudiation_end date,p_compliance_due date,p_compliance_status text,p_settlement_terms text,p_review_note text` | `void` |
| `schedule_kp_hearing` | `043_kp_case_hearings_summons.sql` | `p_case_id uuid, p_proceeding_type text, p_hearing_date date, p_start_time time, p_location text, p_presiding_note text default null, p_admin_notes text default null` | `uuid` |
| `schedule_tanod_assignment` | `044_incident_blotter_tanod.sql` | `p_tanod_id uuid, p_assignment_date date, p_area_label text, p_patrol_type text DEFAULT 'roving', p_start_time time DEFAULT NULL, p_end_time time DEFAULT NULL` | `uuid` |
| `search_case_residents` | `051_case_review_support.sql` | `p_search text` | `table(record_kind text,record_id uuid,full_name text)` |
| `set_barangay_resident_eligibility` | `056_resident_eligibility.sql` | `p_resident_id uuid,p_active boolean` | `void` |
| `set_community_credit_rule_active` | `059_community_credit_foundation.sql` | `p_id uuid,p_active boolean` | `void` |
| `set_incident_map_location` | `057_incident_map_location.sql` | `p_incident_id uuid, p_latitude numeric, p_longitude numeric` | `table(latitude numeric, longitude numeric)` |
| `set_incident_status` | `044_incident_blotter_tanod.sql` | `p_incident_id uuid, p_status text, p_note text DEFAULT NULL` | `void` |
| `set_tanod_account_link` | `052_tanod_accounts_and_duty.sql` | `p_tanod_id uuid,p_profile_id uuid` | `void` |
| `set_tanod_assignment_active` | `044_incident_blotter_tanod.sql` | `p_assignment_id uuid, p_active boolean` | `void` |
| `set_tanod_member_active` | `044_incident_blotter_tanod.sql` | `p_tanod_id uuid, p_active boolean` | `void` |
| `sms_audience_options` | `058_targeted_sms.sql` | `p_source_type text` | `jsonb` |
| `sms_broadcast_state` | `058_targeted_sms.sql` | `p_id uuid` | `jsonb` |
| `sms_prepare_broadcast` | `058_targeted_sms.sql` | `p_source_type text,p_source_id text,p_kind text,p_audience jsonb,p_preview_token text,p_request_key uuid,p_dry_run boolean` | `uuid` |
| `sms_preview` | `058_targeted_sms.sql` | `p_source_type text,p_source_id text,p_draft jsonb,p_audience jsonb` | `jsonb` |
| `sms_save_rule` | `058_targeted_sms.sql` | `p_source_type text,p_source_id text,p_audience jsonb` | `void` |
| `sms_source_history` | `058_targeted_sms.sql` | `p_source_type text,p_source_id text` | `jsonb` |
| `stamp_activity_actor` | `017_nurse_activity_logging.sql` | `` | `trigger` |
| `sync_verified_resident_directory` | `055_verified_resident_directory_sync.sql` | `` | `trigger` |
| `tanod_account_states` | `052_tanod_accounts_and_duty.sql` | `` | `table(tanod_id uuid,profile_id uuid,account_state text)` |
| `tanod_add_followup` | `053_tanod_incident_access.sql` | `p_incident_id uuid,p_note text` | `void` |
| `tanod_assignments_for` | `044_incident_blotter_tanod.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL` | `table (id uuid, tanod_id uuid, tanod_name text, assignment_date date, start_time time, end_time time, patrol_type text, area_label text, active boolean)` |
| `tanod_check_in` | `052_tanod_accounts_and_duty.sql` | `p_assignment_id uuid` | `void` |
| `tanod_check_out` | `052_tanod_accounts_and_duty.sql` | `p_attendance_id uuid` | `void` |
| `tanod_coverage_summary` | `044_incident_blotter_tanod.sql` | `p_from date DEFAULT NULL, p_to date DEFAULT NULL` | `table (area_key text, area_label text, assignment_count integer, tanod_count integer, roving_count integer, static_count integer)` |
| `tanod_my_duty` | `052_tanod_accounts_and_duty.sql` | `` | `table(assignment_id uuid,assignment_date date,area_label text,shift_start timestamptz,shift_end timestamptz, active boolean,attendance_id uuid,checked_in_at timestamptz,checked_out_at timestamptz)` |
| `tanod_my_followups` | `053_tanod_incident_access.sql` | `p_incident_id uuid` | `table(id uuid,note text,created_at timestamptz)` |
| `tanod_my_identity` | `052_tanod_accounts_and_duty.sql` | `` | `table(display_name text,usual_area text,reports_today bigint)` |
| `tanod_my_reports` | `053_tanod_incident_access.sql` | `` | `table(incident_id uuid,reference text,incident_type text,occurred_at timestamptz,general_location text, status text,submitted_by_me boolean,assigned_to_me boolean,kp_linked boolean)` |
| `tanod_roster` | `044_incident_blotter_tanod.sql` | `p_include_inactive boolean DEFAULT true` | `table (id uuid, full_name text, active boolean, area_note text, display_order integer, assignment_count integer)` |
| `track_complaint` | `040_complaint_intake_foundation.sql` | `p_reference text, p_contact text` | `table ( reference text, status text, received_on date, last_updated date )` |
| `update_kp_hearing_record` | `043_kp_case_hearings_summons.sql` | `p_hearing_id uuid, p_status text default null, p_minutes text default null, p_admin_notes text default null` | `uuid` |
| `update_tanod_member` | `047_edit_tanod_member.sql` | `p_tanod_id uuid, p_full_name text, p_area_note text DEFAULT NULL, p_display_order integer DEFAULT 0` | `void` |
| `withdraw_complaint_evidence` | `050_case_evidence_support.sql` | `p_attachment_id uuid, p_reason text` | `void` |
