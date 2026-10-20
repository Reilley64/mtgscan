CREATE TRIGGER create_profile_after_sign_up
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.create_profile_for_new_user();
