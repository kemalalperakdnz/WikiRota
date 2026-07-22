# Güvenli skor doğrulamasını etkinleştirme

1. Supabase SQL Editor'da `secure-score-migration.sql` dosyasının tamamını bir kez çalıştırın.
2. Haftalık lig için `weekly-league-migration.sql` dosyasını da bir kez çalıştırın.
3. Arkadaş düellosu kullanıyorsanız `duel-rooms-migration.sql` ve `duel-settings-migration.sql` dosyalarını da uygulayın.
4. Terminalde proje kökünden aşağıdaki komutları çalıştırın:

```powershell
npx supabase login
npx supabase link --project-ref fvwdjpyevhjrwqvvblwy
npx supabase secrets set ALLOWED_ORIGINS=https://SITENIZIN-ALAN-ADI
npx supabase functions deploy verify-score
```

**Canlıya çıkmadan zorunlu:** `ALLOWED_ORIGINS` değerini gerçek HTTPS domain’inizle değiştirin.
Aksi halde çevrim içi skor gönderimi CORS/403 ile reddedilir.

Örnek:

```powershell
npx supabase secrets set ALLOWED_ORIGINS=https://vikirota.example
```

Birden fazla üretim adresi virgülle ayrılabilir:

```powershell
npx supabase secrets set ALLOWED_ORIGINS=https://vikirota.example,https://www.vikirota.example
```

`localhost` ve `127.0.0.1` geliştirme adreslerine otomatik izin verilir. Edge
Function dağıtılırken JWT doğrulamasını kapatan `--no-verify-jwt` seçeneğini
kullanmayın. `SUPABASE_SERVICE_ROLE_KEY` yalnızca Edge Function ortamında
Supabase tarafından sağlanır; bu anahtarı `supabase-config.js` içine koymayın.

Deploy sonrası ilk açılışta tarayıcıda hard refresh yapın (Service Worker `vikirota-shell-v25`
ve `?v=25` asset sürümleri birlikte yükseltilir).
