# Store training crops with no link to the user

ADR 0010 gives every record that the user writes `created_by` and `updated_by`. Training crops break that rule. A training crop and its evidence record hold no user ID, no copy ID, and no time. The owner decided this when spec 10 (#389) was written: crops with no account link were chosen over a way to delete them.

The brief planned "delete all crops" (#19, A15). That needs the user ID on each crop, so the crops would be stored with the account. The owner wants to learn from real users' scans, not to keep a record of which user scanned which card.

So the app uploads each crop through the `training-crops` Edge Function:

- The function checks the user's token. `add_training_crop` uses the user ID and the copy ID only to check that the copy is the user's, and stores neither.
- `training_crops` holds the random crop ID and the evidence record. It has no user ID, copy ID, `created_by`, `updated_by`, or time columns. No user can read or write it.
- The function writes the image to the private `training-crops` bucket with the secret key, so Storage records no owner for it. The object has no metadata.
- The function writes no log line with the user, the copy, or the crop.

## Consequences

- A crop cannot be removed after it uploads. Nothing ties it to the user.
- An erasure request cannot be met for crops.
- Removing the IDs and times does not make crops anonymous. The owner holds every collection. While mtgscan has few users, a crop of a rare card printing can point to the one user who owns it. Under GDPR, crops then still count as personal data that mtgscan cannot erase on request. The owner accepted this. The legal review before a wider release should look at it again.
- A later account deletion will not remove crops.
- Supabase keeps its own request logs of the Edge Function for a short time. They hold the request time and the caller.
- Deleting a copy does not change a crop that already uploaded.

## Considered options

- **Store the user ID and offer "delete all crops".** Rejected. The crops would be stored with the account. The owner chose crops with no account link instead.
