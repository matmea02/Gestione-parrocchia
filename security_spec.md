# Security Specification - Parish Management App

## Data Invariants
1. A Volunteer must have a firstName and lastName.
2. A VolunteerGroup must have a unique name.
3. Deleting a master group should trigger a cleanup in volunteers (handled by client batch, but rules must allow it).
4. Council members are derived from volunteers marked with `isCouncilMember: true`.

## The Eight Pillars of Hardened Rules

### 1. The Master Gate (Relational Sync)
- Volunteers can be read by any authenticated user.
- Volunteer Groups can be read by any authenticated user.

### 2. Validation Blueprints
- `isValidVolunteer(data)`: checks firstName, lastName, groups (array).
- `isValidGroup(data)`: checks name.

### 3. Path Variable Hardening
- Use `isValidId(volunteerId)` and `isValidId(groupId)`.

### 4. Tiered Identity Logic
- Currently, all users are treated as admins (public demo/parish use).

### 5. Total Array Guarding
- `groups` array in Volunteer must be validated for size and type.

### 6. PII Isolation
- Phone numbers are stored in the main document. Access restricted to signed-in users.

### 7. Atomicity Guarantee
- Client uses batches for group deletions/renames.

### 8. Secure List Queries
- Rules enforced on resource data.

## The "Dirty Dozen" Payloads (Deny Cases)
1. Volunteer without lastName.
2. Volunteer with 1MB phone number string.
3. Group name as an object instead of string.
4. Setting `createdAt` to a client-side timestamp.
5. Deleting a volunteer without being authenticated.
...and others.
