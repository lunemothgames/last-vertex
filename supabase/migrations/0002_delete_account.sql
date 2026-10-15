-- Lets a signed-in player (anonymous or email) delete their own account and cloud save from inside the game.
-- Deleting the auth user cascades to public.saves. Required by Google Play for apps with accounts.

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
