# Programming Language Samples

다양한 프로그래밍 언어의 코드 샘플입니다.

## Python

```python
# Python 예제: 피보나치 수열
def fibonacci(n):
    """
    Generate Fibonacci sequence up to n terms
    """
    if n <= 0:
        return []
    elif n == 1:
        return [0]
    elif n == 2:
        return [0, 1]
    
    fib = [0, 1]
    for i in range(2, n):
        fib.append(fib[i-1] + fib[i-2])
    
    return fib

# 실행 예제
if __name__ == "__main__":
    result = fibonacci(10)
    print(f"Fibonacci sequence: {result}")
```

## JavaScript

```javascript
// JavaScript 예제: Promise와 async/await
class UserService {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;
  }

  async fetchUser(userId) {
    try {
      const response = await fetch(`${this.apiUrl}/users/${userId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const user = await response.json();
      return user;
    } catch (error) {
      console.error('Failed to fetch user:', error);
      throw error;
    }
  }

  async fetchMultipleUsers(userIds) {
    const promises = userIds.map(id => this.fetchUser(id));
    return await Promise.all(promises);
  }
}

// 사용 예제
const service = new UserService('https://api.example.com');
service.fetchUser(123).then(user => console.log(user));
```

## Java

```java
// Java 예제: Generic Stack 구현
import java.util.ArrayList;
import java.util.List;
import java.util.EmptyStackException;

public class Stack<T> {
    private List<T> elements;
    
    public Stack() {
        this.elements = new ArrayList<>();
    }
    
    /**
     * Push an element onto the stack
     */
    public void push(T element) {
        elements.add(element);
    }
    
    /**
     * Pop an element from the stack
     */
    public T pop() {
        if (isEmpty()) {
            throw new EmptyStackException();
        }
        return elements.remove(elements.size() - 1);
    }
    
    /**
     * Peek at the top element
     */
    public T peek() {
        if (isEmpty()) {
            throw new EmptyStackException();
        }
        return elements.get(elements.size() - 1);
    }
    
    /**
     * Check if stack is empty
     */
    public boolean isEmpty() {
        return elements.isEmpty();
    }
    
    /**
     * Get stack size
     */
    public int size() {
        return elements.size();
    }
    
    // 사용 예제
    public static void main(String[] args) {
        Stack<Integer> stack = new Stack<>();
        stack.push(1);
        stack.push(2);
        stack.push(3);
        
        System.out.println("Top element: " + stack.peek());
        System.out.println("Stack size: " + stack.size());
    }
}
```

## Bash/Shell

```bash
#!/bin/bash
# Bash 예제: 시스템 모니터링 스크립트

set -euo pipefail

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# CPU 사용률 확인
check_cpu_usage() {
    local usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    log_info "CPU Usage: ${usage}%"
    
    if (( $(echo "$usage > 80" | bc -l) )); then
        log_warn "High CPU usage detected!"
    fi
}

# 메모리 사용률 확인
check_memory_usage() {
    local total=$(free -m | awk 'NR==2{print $2}')
    local used=$(free -m | awk 'NR==2{print $3}')
    local percent=$((used * 100 / total))
    
    log_info "Memory Usage: ${used}MB / ${total}MB (${percent}%)"
    
    if [ $percent -gt 80 ]; then
        log_error "High memory usage detected!"
    fi
}

# 디스크 사용률 확인
check_disk_usage() {
    log_info "Disk Usage:"
    df -h | grep -E '^/dev/' | while read line; do
        usage=$(echo $line | awk '{print $5}' | cut -d'%' -f1)
        mount=$(echo $line | awk '{print $6}')
        
        if [ $usage -gt 80 ]; then
            log_warn "  $mount: ${usage}% (Critical)"
        else
            echo -e "  $mount: ${usage}%"
        fi
    done
}

# 메인 실행
main() {
    log_info "System Monitoring Started"
    echo "================================"
    
    check_cpu_usage
    check_memory_usage
    check_disk_usage
    
    echo "================================"
    log_info "Monitoring Complete"
}

main
```

## C#

```csharp
// C# 예제: LINQ와 비동기 프로그래밍
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Net.Http;

namespace DocLightSample
{
    /// <summary>
    /// 사용자 데이터 관리 클래스
    /// </summary>
    public class UserManager
    {
        private readonly HttpClient _httpClient;
        private readonly string _apiBaseUrl;
        
        public UserManager(string apiBaseUrl)
        {
            _apiBaseUrl = apiBaseUrl;
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(apiBaseUrl),
                Timeout = TimeSpan.FromSeconds(30)
            };
        }
        
        /// <summary>
        /// 활성 사용자 필터링
        /// </summary>
        public IEnumerable<User> GetActiveUsers(IEnumerable<User> users)
        {
            return users
                .Where(u => u.IsActive)
                .OrderBy(u => u.Name)
                .Select(u => new User 
                { 
                    Id = u.Id, 
                    Name = u.Name, 
                    Email = u.Email 
                });
        }
        
        /// <summary>
        /// 비동기로 사용자 데이터 가져오기
        /// </summary>
        public async Task<User> GetUserAsync(int userId)
        {
            try
            {
                var response = await _httpClient.GetAsync($"/users/{userId}");
                response.EnsureSuccessStatusCode();
                
                var user = await response.Content.ReadAsAsync<User>();
                return user;
            }
            catch (HttpRequestException ex)
            {
                Console.WriteLine($"Error fetching user: {ex.Message}");
                throw;
            }
        }
        
        /// <summary>
        /// 여러 사용자 병렬 조회
        /// </summary>
        public async Task<List<User>> GetMultipleUsersAsync(params int[] userIds)
        {
            var tasks = userIds.Select(id => GetUserAsync(id));
            var users = await Task.WhenAll(tasks);
            return users.ToList();
        }
    }
    
    public class User
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string Email { get; set; }
        public bool IsActive { get; set; }
    }
}
```

## C++

```cpp
// C++ 예제: 템플릿과 STL
#include <iostream>
#include <vector>
#include <algorithm>
#include <memory>
#include <stdexcept>

/**
 * Generic Binary Search Tree
 */
template<typename T>
class BinarySearchTree {
private:
    struct Node {
        T data;
        std::unique_ptr<Node> left;
        std::unique_ptr<Node> right;
        
        Node(const T& value) : data(value), left(nullptr), right(nullptr) {}
    };
    
    std::unique_ptr<Node> root;
    size_t count;
    
    // 재귀 삽입
    void insertRecursive(std::unique_ptr<Node>& node, const T& value) {
        if (!node) {
            node = std::make_unique<Node>(value);
            count++;
            return;
        }
        
        if (value < node->data) {
            insertRecursive(node->left, value);
        } else if (value > node->data) {
            insertRecursive(node->right, value);
        }
        // 중복 값은 무시
    }
    
    // 재귀 검색
    bool searchRecursive(const Node* node, const T& value) const {
        if (!node) return false;
        
        if (value == node->data) return true;
        if (value < node->data) return searchRecursive(node->left.get(), value);
        return searchRecursive(node->right.get(), value);
    }
    
    // 중위 순회
    void inorderTraversal(const Node* node, std::vector<T>& result) const {
        if (!node) return;
        
        inorderTraversal(node->left.get(), result);
        result.push_back(node->data);
        inorderTraversal(node->right.get(), result);
    }

public:
    BinarySearchTree() : root(nullptr), count(0) {}
    
    void insert(const T& value) {
        insertRecursive(root, value);
    }
    
    bool search(const T& value) const {
        return searchRecursive(root.get(), value);
    }
    
    size_t size() const {
        return count;
    }
    
    std::vector<T> toSortedVector() const {
        std::vector<T> result;
        inorderTraversal(root.get(), result);
        return result;
    }
};

// 사용 예제
int main() {
    BinarySearchTree<int> bst;
    
    // 삽입
    std::vector<int> values = {50, 30, 70, 20, 40, 60, 80};
    for (int val : values) {
        bst.insert(val);
    }
    
    // 검색
    std::cout << "Search 40: " << (bst.search(40) ? "Found" : "Not found") << std::endl;
    std::cout << "Search 100: " << (bst.search(100) ? "Found" : "Not found") << std::endl;
    
    // 정렬된 출력
    auto sorted = bst.toSortedVector();
    std::cout << "Sorted values: ";
    for (int val : sorted) {
        std::cout << val << " ";
    }
    std::cout << std::endl;
    
    return 0;
}
```

## C

```c
// C 예제: 링크드 리스트 구현
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/**
 * 링크드 리스트 노드
 */
typedef struct Node {
    int data;
    struct Node* next;
} Node;

/**
 * 링크드 리스트
 */
typedef struct LinkedList {
    Node* head;
    size_t size;
} LinkedList;

/**
 * 새 리스트 생성
 */
LinkedList* list_create(void) {
    LinkedList* list = (LinkedList*)malloc(sizeof(LinkedList));
    if (!list) {
        fprintf(stderr, "Memory allocation failed\n");
        return NULL;
    }
    list->head = NULL;
    list->size = 0;
    return list;
}

/**
 * 리스트 끝에 노드 추가
 */
int list_append(LinkedList* list, int data) {
    if (!list) return -1;
    
    Node* new_node = (Node*)malloc(sizeof(Node));
    if (!new_node) {
        fprintf(stderr, "Memory allocation failed\n");
        return -1;
    }
    
    new_node->data = data;
    new_node->next = NULL;
    
    if (!list->head) {
        list->head = new_node;
    } else {
        Node* current = list->head;
        while (current->next) {
            current = current->next;
        }
        current->next = new_node;
    }
    
    list->size++;
    return 0;
}

/**
 * 리스트 출력
 */
void list_print(const LinkedList* list) {
    if (!list || !list->head) {
        printf("List is empty\n");
        return;
    }
    
    Node* current = list->head;
    printf("List: ");
    while (current) {
        printf("%d", current->data);
        if (current->next) printf(" -> ");
        current = current->next;
    }
    printf("\n");
}

/**
 * 리스트 메모리 해제
 */
void list_destroy(LinkedList* list) {
    if (!list) return;
    
    Node* current = list->head;
    while (current) {
        Node* temp = current;
        current = current->next;
        free(temp);
    }
    free(list);
}

/**
 * 특정 값 검색
 */
int list_find(const LinkedList* list, int data) {
    if (!list) return -1;
    
    Node* current = list->head;
    int index = 0;
    
    while (current) {
        if (current->data == data) {
            return index;
        }
        current = current->next;
        index++;
    }
    
    return -1; // Not found
}

// 메인 함수
int main(void) {
    LinkedList* list = list_create();
    
    // 데이터 추가
    list_append(list, 10);
    list_append(list, 20);
    list_append(list, 30);
    list_append(list, 40);
    
    // 리스트 출력
    list_print(list);
    printf("List size: %zu\n", list->size);
    
    // 검색
    int index = list_find(list, 30);
    if (index != -1) {
        printf("Found 30 at index %d\n", index);
    }
    
    // 메모리 해제
    list_destroy(list);
    
    return 0;
}
```
