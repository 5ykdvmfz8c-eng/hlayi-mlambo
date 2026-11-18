CREATE TABLE public.loan_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL UNIQUE REFERENCES public.loans(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  agreement_number text NOT NULL UNIQUE,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  prepared_by uuid NOT NULL DEFAULT auth.uid(),
  sign_token uuid UNIQUE,
  sign_token_expires_at timestamptz,
  sign_attempts int NOT NULL DEFAULT 0,
  customer_signature text CHECK (customer_signature IS NULL OR length(customer_signature) < 400000),
  customer_signed_name text,
  customer_signed_place text,
  customer_signed_at timestamptz,
  customer_sign_method text CHECK (customer_sign_method IN ('remote','in_person','paper')),
  customer_sign_ip text,
  customer_sign_user_agent text,
  signed_terms jsonb,
  signed_hash text,
  rep_signature text CHECK (rep_signature IS NULL OR length(rep_signature) < 400000),
  rep_name text,
  rep_title text,
  rep_signed_place text,
  rep_signed_at timestamptz,
  rep_user_id uuid,
  witness_signature text CHECK (witness_signature IS NULL OR length(witness_signature) < 400000),
  witness_name text,
  witness_signed_place text,
  witness_signed_at timestamptz,
  paper_recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.loan_agreements TO authenticated;
GRANT ALL ON public.loan_agreements TO service_role;

ALTER TABLE public.loan_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Credit staff view agreements" ON public.loan_agreements
  FOR SELECT TO authenticated USING (public.can_credit(auth.uid()));
CREATE POLICY "Managers prepare agreements" ON public.loan_agreements
  FOR INSERT TO authenticated WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "Managers update agreements" ON public.loan_agreements
  FOR UPDATE TO authenticated USING (public.can_manage(auth.uid())) WITH CHECK (public.can_manage(auth.uid()));

CREATE OR REPLACE FUNCTION public.loan_agreement_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.loans%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.customer_signed_at IS NOT NULL OR NEW.rep_signed_at IS NOT NULL OR NEW.witness_signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Create the agreement before recording signatures';
    END IF;
    SELECT * INTO l FROM public.loans WHERE id = NEW.loan_id;
    IF l.status = 'cancelled' THEN RAISE EXCEPTION 'This loan has been cancelled'; END IF;
    NEW.customer_id := l.customer_id;
    RETURN NEW;
  END IF;

  NEW.updated_at := now();
  NEW.loan_id := OLD.loan_id;
  NEW.customer_id := OLD.customer_id;
  NEW.agreement_number := OLD.agreement_number;
  NEW.prepared_by := OLD.prepared_by;

  IF OLD.customer_signed_at IS NOT NULL THEN
    IF NEW.details IS DISTINCT FROM OLD.details
      OR NEW.customer_signature IS DISTINCT FROM OLD.customer_signature
      OR NEW.customer_signed_name IS DISTINCT FROM OLD.customer_signed_name
      OR NEW.customer_signed_place IS DISTINCT FROM OLD.customer_signed_place
      OR NEW.customer_signed_at IS DISTINCT FROM OLD.customer_signed_at
      OR NEW.customer_sign_method IS DISTINCT FROM OLD.customer_sign_method
      OR NEW.customer_sign_ip IS DISTINCT FROM OLD.customer_sign_ip
      OR NEW.signed_terms IS DISTINCT FROM OLD.signed_terms
      OR NEW.signed_hash IS DISTINCT FROM OLD.signed_hash THEN
      RAISE EXCEPTION 'The customer has signed this agreement, so it can no longer be changed';
    END IF;
  ELSIF NEW.customer_signed_at IS NOT NULL THEN
    IF NEW.customer_sign_method IS NULL THEN RAISE EXCEPTION 'Signing method is required'; END IF;
    IF coalesce(trim(NEW.customer_signed_name), '') = '' THEN RAISE EXCEPTION 'The customer''s full name is required'; END IF;
    IF NEW.customer_sign_method <> 'paper' AND NEW.customer_signature IS NULL THEN RAISE EXCEPTION 'A signature is required'; END IF;
    IF NEW.customer_sign_method = 'paper' THEN
      NEW.customer_signature := NULL;
      NEW.paper_recorded_by := auth.uid();
      IF NEW.customer_signed_at > now() + interval '1 day' THEN RAISE EXCEPTION 'The signing date cannot be in the future'; END IF;
    ELSE
      NEW.customer_signed_at := now();
    END IF;
    SELECT * INTO l FROM public.loans WHERE id = NEW.loan_id;
    IF l.status = 'cancelled' THEN RAISE EXCEPTION 'This loan has been cancelled'; END IF;
    NEW.signed_terms := jsonb_build_object(
      'loan_reference', l.loan_reference, 'principal', l.principal, 'interest_rate', l.interest_rate,
      'interest_amount', l.interest_amount, 'fees', l.fees, 'total_repayable', l.total_repayable,
      'instalment_amount', l.instalment_amount, 'number_of_instalments', l.number_of_instalments,
      'repayment_frequency', l.repayment_frequency, 'first_payment_date', l.first_payment_date,
      'maturity_date', l.maturity_date, 'issue_date', l.issue_date, 'purpose', l.purpose);
    NEW.signed_hash := encode(sha256(convert_to(
      NEW.agreement_number || '|' || NEW.details::text || '|' || NEW.signed_terms::text || '|' ||
      coalesce(NEW.customer_signature, 'paper') || '|' || NEW.customer_signed_at::text, 'UTF8')), 'hex');
  END IF;

  IF OLD.rep_signed_at IS NOT NULL THEN
    IF NEW.rep_signed_at IS DISTINCT FROM OLD.rep_signed_at OR NEW.rep_signature IS DISTINCT FROM OLD.rep_signature
      OR NEW.rep_name IS DISTINCT FROM OLD.rep_name OR NEW.rep_title IS DISTINCT FROM OLD.rep_title
      OR NEW.rep_signed_place IS DISTINCT FROM OLD.rep_signed_place OR NEW.rep_user_id IS DISTINCT FROM OLD.rep_user_id THEN
      RAISE EXCEPTION 'The H&M representative has already signed';
    END IF;
  ELSIF NEW.rep_signed_at IS NOT NULL THEN
    IF NEW.customer_signed_at IS NULL THEN RAISE EXCEPTION 'The customer must sign first'; END IF;
    IF coalesce(trim(NEW.rep_name), '') = '' THEN RAISE EXCEPTION 'The representative''s name is required'; END IF;
    NEW.rep_user_id := auth.uid();
    IF NEW.rep_signature IS NOT NULL THEN NEW.rep_signed_at := now(); END IF;
  END IF;

  IF OLD.witness_signed_at IS NOT NULL THEN
    IF NEW.witness_signed_at IS DISTINCT FROM OLD.witness_signed_at OR NEW.witness_signature IS DISTINCT FROM OLD.witness_signature
      OR NEW.witness_name IS DISTINCT FROM OLD.witness_name OR NEW.witness_signed_place IS DISTINCT FROM OLD.witness_signed_place THEN
      RAISE EXCEPTION 'The witness has already signed';
    END IF;
  ELSIF NEW.witness_signed_at IS NOT NULL THEN
    IF coalesce(trim(NEW.witness_name), '') = '' THEN RAISE EXCEPTION 'The witness''s name is required'; END IF;
    IF NEW.witness_signature IS NOT NULL THEN NEW.witness_signed_at := now(); END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_loan_agreements_guard BEFORE INSERT OR UPDATE ON public.loan_agreements
  FOR EACH ROW EXECUTE FUNCTION public.loan_agreement_guard();

CREATE OR REPLACE FUNCTION public.loan_agreement_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE who text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log(actor_id, action, entity_type, entity_id, summary)
    VALUES (auth.uid(), 'create', 'loan_agreement', NEW.id::text, 'Prepared loan agreement ' || NEW.agreement_number);
    RETURN NEW;
  END IF;
  IF OLD.customer_signed_at IS NULL AND NEW.customer_signed_at IS NOT NULL THEN
    who := coalesce(NEW.customer_signed_name, 'The customer');
    INSERT INTO public.audit_log(actor_id, action, entity_type, entity_id, summary, details)
    VALUES (auth.uid(), 'sign', 'loan_agreement', NEW.id::text,
      who || ' signed loan agreement ' || NEW.agreement_number,
      jsonb_build_object('method', NEW.customer_sign_method, 'ip', NEW.customer_sign_ip, 'hash', NEW.signed_hash));
    INSERT INTO public.notifications(type, title, message, link, entity_id)
    VALUES ('agreement_signed', 'Loan agreement signed',
      who || ' signed agreement ' || NEW.agreement_number ||
        CASE NEW.customer_sign_method WHEN 'remote' THEN ' online.' WHEN 'paper' THEN ' on paper.' ELSE ' in person.' END,
      '/agreements/' || NEW.loan_id::text, NEW.id);
  END IF;
  IF OLD.rep_signed_at IS NULL AND NEW.rep_signed_at IS NOT NULL THEN
    INSERT INTO public.audit_log(actor_id, action, entity_type, entity_id, summary)
    VALUES (auth.uid(), 'sign', 'loan_agreement', NEW.id::text, coalesce(NEW.rep_name, 'Representative') || ' signed agreement ' || NEW.agreement_number || ' for H&M');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_loan_agreements_after AFTER INSERT OR UPDATE ON public.loan_agreements
  FOR EACH ROW EXECUTE FUNCTION public.loan_agreement_after();