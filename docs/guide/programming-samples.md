# Programming Code Samples

This document contains various programming language code samples to test syntax highlighting.

## JavaScript Example

```javascript
// Fibonacci function with memoization
function fibonacci(n, memo = {}) {
  if (n in memo) return memo[n];
  if (n <= 1) return n;

  memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo);
  return memo[n];
}

// Test the function
console.log('Fibonacci sequence:');
for (let i = 0; i < 10; i++) {
  console.log(`F(${i}) = ${fibonacci(i)}`);
}
```

## Python Example

```python
# Quick sort algorithm
def quicksort(arr):
    if len(arr) <= 1:
        return arr

    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]

    return quicksort(left) + middle + quicksort(right)

# Test the function
numbers = [3, 6, 8, 10, 1, 2, 1]
print(f"Original: {numbers}")
print(f"Sorted: {quicksort(numbers)}")
```

## Java Example

```java
// Binary search implementation
public class BinarySearch {
    public static int binarySearch(int[] arr, int target) {
        int left = 0;
        int right = arr.length - 1;

        while (left <= right) {
            int mid = left + (right - left) / 2;

            if (arr[mid] == target) {
                return mid;
            } else if (arr[mid] < target) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        return -1; // Not found
    }

    public static void main(String[] args) {
        int[] numbers = {1, 3, 5, 7, 9, 11, 13};
        int target = 7;
        int result = binarySearch(numbers, target);
        System.out.println("Found at index: " + result);
    }
}
```

## TypeScript Example

```typescript
// Generic stack implementation
class Stack<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  peek(): T | undefined {
    return this.items[this.items.length - 1];
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }
}

// Usage
const numberStack = new Stack<number>();
numberStack.push(1);
numberStack.push(2);
numberStack.push(3);
console.log(numberStack.pop()); // 3
```

## Go Example

```go
package main

import (
    "fmt"
    "sync"
)

// Worker pool pattern
func worker(id int, jobs <-chan int, results chan<- int, wg *sync.WaitGroup) {
    defer wg.Done()
    for job := range jobs {
        fmt.Printf("Worker %d processing job %d\n", id, job)
        results <- job * 2
    }
}

func main() {
    const numJobs = 5
    const numWorkers = 3

    jobs := make(chan int, numJobs)
    results := make(chan int, numJobs)
    var wg sync.WaitGroup

    // Start workers
    for w := 1; w <= numWorkers; w++ {
        wg.Add(1)
        go worker(w, jobs, results, &wg)
    }

    // Send jobs
    for j := 1; j <= numJobs; j++ {
        jobs <- j
    }
    close(jobs)

    // Wait and collect results
    wg.Wait()
    close(results)

    for result := range results {
        fmt.Println("Result:", result)
    }
}
```

## SQL Example

```sql
-- Complex query with joins and aggregation
SELECT
    c.customer_name,
    c.email,
    COUNT(o.order_id) as total_orders,
    SUM(o.total_amount) as total_spent,
    AVG(o.total_amount) as avg_order_value
FROM
    customers c
LEFT JOIN
    orders o ON c.customer_id = o.customer_id
WHERE
    o.order_date >= DATE_SUB(CURRENT_DATE, INTERVAL 1 YEAR)
GROUP BY
    c.customer_id, c.customer_name, c.email
HAVING
    COUNT(o.order_id) > 5
ORDER BY
    total_spent DESC
LIMIT 10;
```

## CSS Example

```css
/* Modern CSS with Grid and Flexbox */
.container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  padding: 2rem;
}

.card {
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2);
}

.card__title {
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  margin-bottom: 1rem;
}

.card__content {
  flex: 1;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.6;
}
```

## Bash Example

```bash
#!/bin/bash

# Backup script with rotation
BACKUP_DIR="/backups"
SOURCE_DIR="/data"
MAX_BACKUPS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="backup_${TIMESTAMP}.tar.gz"

# Create backup
echo "Creating backup: $BACKUP_NAME"
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}" "$SOURCE_DIR"

if [ $? -eq 0 ]; then
    echo "Backup created successfully"

    # Rotate old backups
    cd "$BACKUP_DIR" || exit
    BACKUP_COUNT=$(ls -1 backup_*.tar.gz 2>/dev/null | wc -l)

    if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
        echo "Rotating old backups..."
        ls -1t backup_*.tar.gz | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f
    fi
else
    echo "Backup failed!"
    exit 1
fi
```

## Testing Instructions

1. Open this file in the DocLight viewer
2. Check if syntax highlighting is applied to all code blocks
3. Verify that the copy button (📋) appears on each code block
4. Test copying code by clicking the copy button
5. Check browser console for any errors
