import { trpc } from "@/providers/trpc";

export default function PaymentActivation() {
  const officeAddress = trpc.settings.get.useQuery({
    key: "office_address",
  });

  const officePhone = trpc.settings.get.useQuery({
    key: "office_phone",
  });

  const whatsapp = trpc.settings.get.useQuery({
    key: "whatsapp",
  });

  const paymentEmail = trpc.settings.get.useQuery({
    key: "payment_email",
  });

  const officeText =
    typeof officeAddress.data === "object" && officeAddress.data
      ? officeAddress.data.value ?? "-"
      : String(officeAddress.data ?? "-");

  const phoneText =
    typeof officePhone.data === "object" && officePhone.data
      ? officePhone.data.value ?? "-"
      : String(officePhone.data ?? "-");

  const whatsappText =
    typeof whatsapp.data === "object" && whatsapp.data
      ? whatsapp.data.value ?? "-"
      : String(whatsapp.data ?? "-");

  const emailText =
    typeof paymentEmail.data === "object" && paymentEmail.data
      ? paymentEmail.data.value ?? "-"
      : String(paymentEmail.data ?? "-");

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">
        Payment Activation
      </h1>

      <div className="bg-white rounded-xl shadow p-6">
        <p className="mb-4">
          Your account is created successfully.
        </p>

        <p className="mb-2">
          Subscription Status:
          <strong> Pending Payment</strong>
        </p>

        <hr className="my-5" />

        <h2 className="font-semibold text-lg">
          Payment Information
        </h2>

        <div className="mt-4 space-y-2">
          <p>
            <strong>Office:</strong> {officeText}
          </p>

          <p>
            <strong>Phone:</strong> {phoneText}
          </p>

          <p>
            <strong>WhatsApp:</strong> {whatsappText}
          </p>

          <p>
            <strong>Email:</strong> {emailText}
          </p>
        </div>

        <div className="mt-8">
          <h3 className="font-medium mb-3">
            Instructions
          </h3>

          <ol className="list-decimal pl-6 space-y-2">
            <li>Visit office or contact us</li>
            <li>Complete payment</li>
            <li>Send receipt or payment proof</li>
            <li>Wait for activation</li>
            <li>Dashboard unlocks automatically</li>
          </ol>
        </div>
      </div>
    </div>
  );
}