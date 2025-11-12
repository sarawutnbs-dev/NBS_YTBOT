"use client";

import { useState } from "react";
import { Form, Input, Button, Divider, message } from "antd";
import { GoogleOutlined, UserOutlined, LockOutlined } from "@ant-design/icons";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const handleCredentialsLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        username: values.username,
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        message.error("Invalid username or password");
      } else if (result?.ok) {
        message.success("Login successful!");
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (error) {
      message.error("An error occurred during login");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } catch (error) {
      message.error("An error occurred during Google login");
      console.error(error);
      setGoogleLoading(false);
    }
  };

  return (
    <div>
      <Form
        name="login"
        onFinish={handleCredentialsLogin}
        autoComplete="off"
        layout="vertical"
      >
        <Form.Item
          label="Username"
          name="username"
          rules={[{ required: true, message: "Please input your username!" }]}
        >
          <Input prefix={<UserOutlined />} placeholder="Username" size="large" />
        </Form.Item>

        <Form.Item
          label="Password"
          name="password"
          rules={[{ required: true, message: "Please input your password!" }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="Password"
            size="large"
          />
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
          >
            Sign In
          </Button>
        </Form.Item>
      </Form>

      <Divider>OR</Divider>

      <Button
        icon={<GoogleOutlined />}
        onClick={handleGoogleLogin}
        loading={googleLoading}
        block
        size="large"
      >
        Continue with Google
      </Button>
    </div>
  );
}
