begin;

create table pharm.course_banks (
  id text primary key check (id ~ '^[a-f0-9]{24}$'),
  subject text not null check (length(subject) between 1 and 100),
  source_name text not null check (length(source_name) between 1 and 255),
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  published_at timestamptz
);
alter table pharm.course_banks enable row level security;
revoke all on table pharm.course_banks from public, anon, authenticated;

create function public.hamster_course_bank(p_bank text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bank pharm.course_banks;
begin
  if not exists (
    select 1 from pharm.accounts account
    join auth.users member on member.id = account.auth_user_id
    where account.auth_user_id = auth.uid()
    and account.role = 'student' and account.active
    and member.email_confirmed_at is not null and not member.is_anonymous
  ) then
    raise insufficient_privilege using message = 'access_denied';
  end if;

  select * into bank from pharm.course_banks
  where id = p_bank and published_at <= now();
  if not found then return null; end if;
  return jsonb_build_object('id',bank.id,'subject',bank.subject,
    'sourceName',bank.source_name,'questions',bank.questions);
end
$$;
revoke all on function public.hamster_course_bank(text) from public, anon;
grant execute on function public.hamster_course_bank(text) to authenticated;

commit;
