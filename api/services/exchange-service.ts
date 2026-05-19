export async function fetchExchangeRates() {
  const apiKey = process.env.EXCHANGE_API_KEY;
  const url = process.env.EXCHANGE_API_URL;

  const response = await fetch(
    `${url}/${apiKey}/latest/USD`
  );

  const text = await response.text();

  console.log("[raw exchange response]", text);

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "Exchange API returned HTML instead of JSON. Check URL/API key."
    );
  }

  if (!data?.conversion_rates) {
    throw new Error(
      "Rates not found in API response"
    );
  }

  return [
    { code:"AFN", rate:data.conversion_rates.AFN },
    { code:"EUR", rate:data.conversion_rates.EUR },
    { code:"AED", rate:data.conversion_rates.AED },
    { code:"SAR", rate:data.conversion_rates.SAR },
    { code:"PKR", rate:data.conversion_rates.PKR },
  ];
}