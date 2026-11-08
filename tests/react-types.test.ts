import type {
  UseCollectionResult,
  UseDocumentResult,
} from '../packages/react/src/types';
import type { DocumentRecord } from '../packages/client/src/types';

interface Product {
  name: string;
  price: number;
  inStock: boolean;
}

declare const collection: UseCollectionResult<Product>;
declare const documentResult: UseDocumentResult<Product>;

const product: DocumentRecord<Product> = collection.data[0];

const productName: string = product.data.name;
const productPrice: number = product.data.price;
const productStock: boolean = product.data.inStock;

const optionalProduct: DocumentRecord<Product> | null = documentResult.data;

if (optionalProduct) {
  const name: string = optionalProduct.data.name;
  const price: number = optionalProduct.data.price;

  // @ts-expect-error Product price must be a number.
  const invalidPrice: string = optionalProduct.data.price;

  // @ts-expect-error Product name must be a string.
  const invalidName: number = optionalProduct.data.name;

  void [name, price, invalidPrice, invalidName];
}

// @ts-expect-error Unknown product property must not be inferred.
const invalidField: string = product.data.nonexistent;

void [productName, productPrice, productStock, invalidField];
console.log('PASS: React hook generic type inference');
