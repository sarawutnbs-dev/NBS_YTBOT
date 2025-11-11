"use client";

import { useState } from "react";
import { Button, Popconfirm, Space, Table, Tag, message } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import axios from "axios";
import useSWR from "swr";

import ProductForm from "./ProductForm.client";

type ProductWithTags = {
  id: string;
  name: string;
  affiliateUrl: string;
  shortURL: string | null;
  tags: string[];
  price?: number;
  commission?: number;
  productLink?: string;
  shopeeProductId?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export default function ProductsTable() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: products = [], mutate } = useSWR<ProductWithTags[]>("/api/products", fetcher);

  async function handleDelete(id: string) {
    try {
      setLoading(true);
      await axios.delete(`/api/products/${id}`);
      message.success("Product deleted");
      mutate(); // Refresh data
    } catch (error) {
      console.error(error);
      message.error("Failed to delete product");
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncShopee() {
    try {
      setSyncing(true);
      message.loading({ content: "Syncing products from Shopee...", key: "sync" });

      const response = await axios.post("/api/products/sync-shopee");

      message.success({
        content: response.data.message || `Synced ${response.data.synced} products successfully`,
        key: "sync",
        duration: 3
      });

      mutate(); // Refresh data
    } catch (error) {
      console.error(error);
      const errorMessage = axios.isAxiosError(error) && error.response?.data?.details
        ? error.response.data.details
        : "Failed to sync products from Shopee";

      message.error({
        content: errorMessage,
        key: "sync",
        duration: 5
      });
    } finally {
      setSyncing(false);
    }
  }

  const columns: ColumnsType<ProductWithTags> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name"
    },
    {
      title: "Price",
      dataIndex: "price",
      key: "price",
      sorter: (a, b) => (a.price || 0) - (b.price || 0),
      render: (value?: number) => value ? `฿${value.toLocaleString()}` : "-"
    },
    {
      title: "Commission",
      dataIndex: "commission",
      key: "commission",
      sorter: (a, b) => (a.commission || 0) - (b.commission || 0),
      defaultSortOrder: 'descend' as const,
      render: (value?: number) => value ? `฿${value.toLocaleString()}` : "-"
    },
    {
      title: "Short URL",
      dataIndex: "shortURL",
      key: "shortURL",
      render: (value: string | null) => (
        value ? (
          <a href={value} target="_blank" rel="noreferrer">
            {value}
          </a>
        ) : (
          <span style={{ color: "#999" }}>-</span>
        )
      )
    },
    {
      title: "Tags",
      dataIndex: "tags",
      key: "tags",
      render: (_: unknown, record: ProductWithTags) => {
        return record.tags.length ? record.tags.map(tag => <Tag key={tag}>{tag}</Tag>) : <Tag color="default">None</Tag>;
      }
    },
    {
      title: "Source",
      key: "source",
      render: (_: unknown, record: ProductWithTags) => {
        return record.shopeeProductId ? <Tag color="orange">Shopee</Tag> : <Tag color="blue">Manual</Tag>;
      }
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: ProductWithTags) => (
        <Space>
          <Popconfirm title="Remove product?" onConfirm={() => handleDelete(record.id)}>
            <Button danger>Delete</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<SyncOutlined spin={syncing} />}
          onClick={handleSyncShopee}
          loading={syncing}
        >
          Sync Products from Shopee
        </Button>
      </Space>
      <ProductForm onCreated={() => mutate()} />
      <Table<ProductWithTags>
        rowKey="id"
        loading={loading}
        dataSource={products}
        columns={columns}
      />
    </>
  );
}
