update public.ai_settings
set
  input_token_price_usd_per_million = 2.5,
  output_token_price_usd_per_million = 15,
  pricing_source = 'https://platform.openai.com/docs/pricing',
  updated_at = now()
where provider = 'openai'
  and model = 'gpt-5.4';
