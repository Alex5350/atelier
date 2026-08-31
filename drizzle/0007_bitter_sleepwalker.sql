-- Review gating, enforced by the database: a reference row can only ever
-- point at an approved asset. Server code validates first for friendly
-- errors; this trigger makes the invariant impossible to violate even
-- through raw SQL.
CREATE FUNCTION atelier_assert_approved_reference() RETURNS trigger AS $$
BEGIN
    IF (SELECT review_status FROM assets WHERE id = NEW.asset_id) <> 'approved' THEN
        RAISE EXCEPTION 'asset % is not approved for referencing (review status: %)',
            NEW.asset_id,
            (SELECT review_status FROM assets WHERE id = NEW.asset_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER asset_references_gating
    BEFORE INSERT ON asset_references
    FOR EACH ROW EXECUTE FUNCTION atelier_assert_approved_reference();
