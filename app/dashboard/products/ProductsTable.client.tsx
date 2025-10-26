"use client";

import { useState } from "react";
import { Button, Popconfirm, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import axios from "axios";

import ProductForm from "./ProductForm.client";

type ProductWithTags = {
  id: string;
  name: string;
  affiliateUrl: string;
  tags: string[];
  createdAt: string | Date;
  updatedAt: string | Date;
};

type ProductsTableProps = {
  initialProducts: ProductWithTags[];
};

export default function ProductsTable({ initialProducts }: ProductsTableProps) {
  const [products, setProducts] = useState<ProductWithTags[]>(initialProducts);
  const [loading, setLoading] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const { data } = await axios.get<ProductWithTags[]>("/api/products");
      setProducts(data);
    } catch (error) {
      console.error(error);
      message.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      setLoading(true);
      await axios.delete(`/api/products/${id}`);
      message.success("Product removed");
      reload();
    } catch (error) {
      console.error(error);
      message.error("Failed to delete product");
    } finally {
      setLoading(false);
    }
  }

  const columns: ColumnsType<ProductWithTags> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name"
    },
    {
      title: "Affiliate URL",
      dataIndex: "affiliateUrl",
      key: "affiliateUrl",
      render: (value: string) => (
        <a href={value} target="_blank" rel="noreferrer">
          {value}
        </a>
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
      <ProductForm onCreated={reload} />
      <Table<ProductWithTags>
        rowKey="id"
        loading={loading}
        dataSource={products}
        columns={columns}
      />
    </>
  );
}
