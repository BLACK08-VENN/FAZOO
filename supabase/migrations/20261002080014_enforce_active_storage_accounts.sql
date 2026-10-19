-- Pending users may manage registration photos; operational files require approval.
ALTER POLICY storage_upload_own_folder ON storage.objects WITH CHECK (
 bucket_id IN ('profile-photos','daily-log-photos')
 AND (storage.foldername(name))[2]=auth.uid()::text
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
 AND p.organization_id::text=(storage.foldername(name))[1]
 AND (p.account_status='approved' OR (bucket_id='profile-photos' AND p.account_status='pending')))
);
ALTER POLICY storage_delete_own ON storage.objects USING (
 bucket_id IN ('profile-photos','daily-log-photos')
 AND (storage.foldername(name))[2]=auth.uid()::text
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
 AND p.organization_id::text=(storage.foldername(name))[1]
 AND (p.account_status='approved' OR (bucket_id='profile-photos' AND p.account_status='pending')))
);
ALTER POLICY booklist_docs_delete_own ON storage.objects USING (
 bucket_id='booklist-documents' AND (storage.foldername(name))[2]=auth.uid()::text
 AND public.account_status_active()
);
