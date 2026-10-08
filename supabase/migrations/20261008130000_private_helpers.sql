-- Keep SECURITY DEFINER helpers out of the API.
--
-- Everything in `public` is exposed by PostgREST as /rest/v1/rpc/<name>. The
-- policy helpers only answer yes/no about the caller's own visibility, but they
-- have no reason to be callable directly, and the signup trigger function must
-- never be. Move the helpers to a non-exposed `private` schema and revoke
-- direct execution of the trigger function.

create schema if not exists private;
revoke all on schema private from public;
-- RLS policies run as the calling role, so it needs to reach the helpers.
grant usage on schema private to authenticated;

alter function public.can_see_food(uuid) set schema private;
alter function public.owns_food(uuid) set schema private;
alter function public.owns_price(uuid) set schema private;

revoke all on function private.can_see_food(uuid), private.owns_food(uuid), private.owns_price(uuid) from public, anon;
grant execute on function private.can_see_food(uuid), private.owns_food(uuid), private.owns_price(uuid) to authenticated;

-- Only ever invoked by the on_auth_user_created trigger.
revoke all on function public.handle_new_user() from public, anon, authenticated;
