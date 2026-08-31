# Student account migration and legacy-record handling

The authenticated student experience uses the existing `users.id` as the stable
owner of memberships and exam attempts. Existing users that already have a real
email address and password hash require no account conversion: signing in loads
their existing ID, classes, attempts, and published results.

Migration `0011_glossy_moon_knight.sql` preserves legacy rows. It promotes an
enrollment from `guest_student_id` to `student_id` only when that value exactly
matches an existing `users.id`. It never matches by display name or invents an
email address or password. Duplicate enrollment rows are retained as legacy
guest rows while one active row becomes the canonical account membership.

## Passwordless legacy students

The removed name-and-code flow created local student rows without credentials.
Those rows and their academic records remain intact, but they cannot authenticate
through the new password flow. A new account must not claim them merely because
its display name or email text appears similar.

The safe claim path is an administrator-assisted, audited merge after the
university verifies the student's institutional identity:

1. Identify the exact legacy `users.id` named by the student and the new verified
   account ID. Do not search or decide ownership by display-name equality.
2. Verify ownership outside VoxExam using an institutional identity source or an
   authorized university administrator.
3. Review all memberships and attempts attached to the legacy ID for conflicts.
4. In one reviewed database transaction, reassign those exact records to the
   verified account, preserve the legacy user and an audit mapping, and resolve
   duplicate memberships without deleting attempts or results.
5. Have a second authorized reviewer confirm the mapping before it is applied to
   production.

This repository does not currently have an institutional identity-verification
workflow or an audited account-merge table, so it intentionally does not expose
a self-service claim endpoint. Adding that workflow requires a separate security
and database review.
