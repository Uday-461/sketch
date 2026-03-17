import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Provider = "anthropic" | "bedrock" | "litellm";

interface StepConfigureLLMProps {
  initialProvider?: Provider;
  initialConnected?: boolean;
  onNext: (data: {
    provider: Provider;
    connected: boolean;
  }) => void;
}

const bedrockRegions = ["us-east-1", "us-west-2", "eu-west-1", "eu-west-3", "ap-southeast-1", "ap-northeast-1"];

export function StepConfigureLLM({ initialProvider, initialConnected, onNext }: StepConfigureLLMProps) {
  const [provider, setProvider] = useState<Provider>(initialProvider ?? "anthropic");
  const [apiKey, setApiKey] = useState("");
  const [awsAccessKey, setAwsAccessKey] = useState("");
  const [awsSecretKey, setAwsSecretKey] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [litellmApiKey, setLitellmApiKey] = useState("");
  const [litellmModel, setLitellmModel] = useState("");
  const [isConnected, setIsConnected] = useState(initialConnected ?? false);
  const [error, setError] = useState("");

  const handleContinue = () => {
    onNext({
      provider,
      connected: isConnected,
    });
  };

  const canConnect =
    provider === "anthropic"
      ? apiKey.trim().length > 0
      : provider === "bedrock"
        ? awsAccessKey.trim().length > 0 && awsSecretKey.trim().length > 0 && awsRegion.trim().length > 0
        : litellmApiKey.trim().length > 0 && litellmModel.trim().length > 0;

  const llmMutation = useMutation({
    mutationFn: async () => {
      if (provider === "anthropic") {
        const payload = { provider: "anthropic" as const, apiKey: apiKey.trim() };
        await api.setup.verifyLlm(payload);
        await api.setup.llm(payload);
        return;
      }

      if (provider === "bedrock") {
        const payload = {
          provider: "bedrock" as const,
          awsAccessKeyId: awsAccessKey.trim(),
          awsSecretAccessKey: awsSecretKey.trim(),
          awsRegion: awsRegion.trim(),
        };
        await api.setup.verifyLlm(payload);
        await api.setup.llm(payload);
        return;
      }

      const payload = {
        provider: "litellm" as const,
        apiKey: litellmApiKey.trim(),
        model: litellmModel.trim(),
      };
      await api.setup.verifyLlm(payload);
      await api.setup.llm(payload);
    },
    onSuccess: () => {
      setIsConnected(true);
      setApiKey("");
      setAwsAccessKey("");
      setAwsSecretKey("");
      setLitellmApiKey("");
      setLitellmModel("");
      const providerLabel =
        provider === "anthropic" ? "Anthropic" : provider === "bedrock" ? "AWS Bedrock" : "LiteLLM Proxy";
      toast.success(`Connected to ${providerLabel}, using Claude Sonnet.`);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const isVerifying = llmMutation.isPending;

  const handleConnect = () => {
    setError("");
    if (!canConnect) return;
    llmMutation.mutate();
  };

  return (
    <div className="w-full max-w-[520px]">
      <div className="mb-1">
        <h1 className="text-xl font-semibold">Connect your LLM</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Sketch uses Anthropic&apos;s Claude models. Choose how you&apos;d like to connect.
      </p>

      {isConnected ? (
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-success/10">
                <span className="text-sm font-semibold text-success">✓</span>
              </div>
              <div>
                <p className="text-sm font-medium">
                  Connected to{" "}
                  {provider === "anthropic" ? "Anthropic" : provider === "bedrock" ? "AWS Bedrock" : "LiteLLM Proxy"}
                </p>
                <p className="text-xs text-muted-foreground">Using Claude Sonnet</p>
              </div>
            </div>
          </div>
          <Button className="w-full" onClick={handleContinue}>
            Continue
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => {
                setProvider("anthropic");
                setError("");
              }}
              className={cn(
                "rounded-lg border p-4 text-left transition-all",
                provider === "anthropic"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-muted-foreground/30",
              )}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                  <title>Anthropic logo</title>
                  <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.604L16.742 20.48h-3.603L6.569 3.52zM0 20.48h3.604L10.174 3.52H6.569L0 20.48z" />
                </svg>
                <span className="text-sm font-medium">Anthropic</span>
              </div>
              <p className="text-xs text-muted-foreground">Direct API key</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setProvider("bedrock");
                setError("");
              }}
              className={cn(
                "rounded-lg border p-4 text-left transition-all",
                provider === "bedrock"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-muted-foreground/30",
              )}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                  <title>AWS logo</title>
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                <span className="text-sm font-medium">AWS Bedrock</span>
              </div>
              <p className="text-xs text-muted-foreground">Via your AWS account</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setProvider("litellm");
                setError("");
              }}
              className={cn(
                "rounded-lg border p-4 text-left transition-all",
                provider === "litellm"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-muted-foreground/30",
              )}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                  <title>LiteLLM logo</title>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
                <span className="text-sm font-medium">LiteLLM Proxy</span>
              </div>
              <p className="text-xs text-muted-foreground">Any LLM provider</p>
            </button>
          </div>

          <div className="space-y-3">
            {provider === "anthropic" ? (
              <div className="space-y-1.5">
                <Label htmlFor="apiKey" className="text-xs">
                  API Key
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  disabled={isVerifying}
                  className="font-mono text-xs"
                />
              </div>
            ) : provider === "bedrock" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="awsAccess" className="text-xs">
                    AWS Access Key ID
                  </Label>
                  <Input
                    id="awsAccess"
                    value={awsAccessKey}
                    onChange={(e) => setAwsAccessKey(e.target.value)}
                    placeholder="AKIA..."
                    disabled={isVerifying}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="awsSecret" className="text-xs">
                    AWS Secret Access Key
                  </Label>
                  <Input
                    id="awsSecret"
                    type="password"
                    value={awsSecretKey}
                    onChange={(e) => setAwsSecretKey(e.target.value)}
                    disabled={isVerifying}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="awsRegion" className="text-xs">
                    AWS Region
                  </Label>
                  <select
                    id="awsRegion"
                    value={awsRegion}
                    onChange={(event) => setAwsRegion(event.target.value)}
                    disabled={isVerifying}
                    className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {bedrockRegions.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="litellmApiKey" className="text-xs">
                    API Key
                  </Label>
                  <Input
                    id="litellmApiKey"
                    type="password"
                    value={litellmApiKey}
                    onChange={(e) => setLitellmApiKey(e.target.value)}
                    placeholder="Downstream provider API key"
                    disabled={isVerifying}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="litellmModel" className="text-xs">
                    Model
                  </Label>
                  <Input
                    id="litellmModel"
                    value={litellmModel}
                    onChange={(e) => setLitellmModel(e.target.value)}
                    placeholder="e.g. openrouter/anthropic/claude-sonnet-4"
                    disabled={isVerifying}
                    className="font-mono text-xs"
                  />
                </div>
              </>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <p className="text-xs text-muted-foreground">
            Sketch defaults to Claude Sonnet. You can switch models per conversation from chat settings.
          </p>

          <Button className="w-full" onClick={handleConnect} disabled={!canConnect || isVerifying}>
            Connect
          </Button>
        </div>
      )}
    </div>
  );
}
